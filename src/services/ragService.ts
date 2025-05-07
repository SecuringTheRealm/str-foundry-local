import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import csvParser from 'csv-parser';
import { createHash } from 'crypto';
import computeCosineSimilarity from 'compute-cosine-similarity';

interface CSVRow {
    [key: string]: string;
}

interface DocumentChunk {
    id: string;
    content: string;
    metadata: string;
    embedding?: number[];
}

export interface IngestedFileInfo {
    fileName: string;
    ingestTime: Date;
}

export interface RAGStats {
    totalSearches: number;
    totalMatches: number;
    embeddingFailures: number;
}

export interface RAGSearchResult {
    content: string;
    similarity: number;
    sourceType: 'vector' | 'text';
}

export class RAGService {
    private db: Database.Database | null = null;
    private dbPath: string = path.join(process.cwd(), 'rag.db');
    private dataDir: string = path.join(process.cwd(), 'data');
    private openai: OpenAI;
    private isInitialized: boolean = false;
    private hasContent: boolean = false;
    private ingestedFiles: IngestedFileInfo[] = [];
    private lastIngestTime: Date | null = null;
    private searchCount: number = 0;
    private matchCount: number = 0;
    private embeddingFailureCount: number = 0;
    private useFullTextSearch: boolean = false;

    constructor() {
        this.openai = new OpenAI({
            apiKey: 'not-needed-for-local',
            baseURL: 'http://localhost:5272/v1',
        });
    }

    /**
     * Initialize the RAG service by setting up the database and ingesting data
     */
    public async initialize(): Promise<boolean> {
        try {
            // Check if data directory exists and has files
            if (!fs.existsSync(this.dataDir)) {
                console.log('Data directory does not exist');
                return false;
            }

            const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.csv'));
            if (files.length === 0) {
                console.log('No CSV files found in data directory');
                return false;
            }

            // Check if database already exists and if it's up-to-date
            const dbExists = fs.existsSync(this.dbPath);
            let regenerateDb = !dbExists;

            if (dbExists) {
                // Check if any CSV files are newer than the database file
                const dbStats = fs.statSync(this.dbPath);
                for (const file of files) {
                    const filePath = path.join(this.dataDir, file);
                    const fileStats = fs.statSync(filePath);
                    if (fileStats.mtime > dbStats.mtime) {
                        console.log(`CSV file ${file} has been updated, regenerating database`);
                        regenerateDb = true;
                        break;
                    }
                }
            }

            // Set up the database
            this.db = new Database(this.dbPath);

            // Create tables if they don't exist or if regenerating
            if (regenerateDb) {
                this.setupDatabase();

                // Clear previous ingestion records
                this.ingestedFiles = [];

                // Ingest all CSV files
                for (const file of files) {
                    const filePath = path.join(this.dataDir, file);
                    await this.ingestCSV(filePath);

                    // Record ingestion time and file
                    const ingestTime = new Date();
                    this.ingestedFiles.push({
                        fileName: file,
                        ingestTime
                    });
                    this.lastIngestTime = ingestTime;
                }
            } else {
                // If we didn't regenerate, still populate the ingested files info
                // based on the files in the data directory
                this.ingestedFiles = files.map(file => {
                    const filePath = path.join(this.dataDir, file);
                    const fileStats = fs.statSync(filePath);
                    return {
                        fileName: file,
                        ingestTime: fileStats.mtime
                    };
                });

                if (this.ingestedFiles.length > 0) {
                    // Set the last ingest time to the most recent file modification
                    this.lastIngestTime = new Date(Math.max(
                        ...this.ingestedFiles.map(file => file.ingestTime.getTime())
                    ));
                }
            }

            // Check if we have content in the database
            const count = this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
            this.hasContent = count.count > 0;

            // Test embedding API availability
            try {
                await this.getEmbedding("test embedding availability");
                this.useFullTextSearch = false;
                console.log("Embedding API is available, using vector search");
            } catch (error) {
                console.log("Embedding API unavailable, will use text search as fallback");
                this.useFullTextSearch = true;
                // Try to set up FTS if not already done
                this.setupFullTextSearch();
            }

            this.isInitialized = true;
            return this.hasContent;
        } catch (error) {
            console.error('Error initializing RAG service:', error);
            return false;
        }
    }

    /**
     * Set up the SQLite database schema
     */
    private setupDatabase(): void {
        if (!this.db) return;

        // Drop tables if they exist for regeneration
        this.db.prepare('DROP TABLE IF EXISTS documents').run();
        this.db.prepare('DROP TABLE IF EXISTS embeddings').run();
        this.db.prepare('DROP TABLE IF EXISTS documents_fts').run();

        // Create documents table
        this.db.prepare(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT
      )
    `).run();

        // Create embeddings table
        this.db.prepare(`
      CREATE TABLE embeddings (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        embedding TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `).run();

        // Set up full-text search as well
        this.setupFullTextSearch();
    }

    /**
     * Set up full-text search capability
     */
    private setupFullTextSearch(): void {
        if (!this.db) return;

        try {
            // Drop existing FTS table if it exists
            this.db.prepare('DROP TABLE IF EXISTS documents_fts').run();

            // Create FTS virtual table for text search
            this.db.prepare(`
        CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
          id,
          content,
          content='documents',
          content_rowid='rowid'
        )
      `).run();

            // Create triggers to keep FTS table in sync with documents
            this.db.prepare(`
        CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents
        BEGIN
          INSERT INTO documents_fts(id, content) VALUES (new.id, new.content);
        END
      `).run();

            this.db.prepare(`
        CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents
        BEGIN
          INSERT INTO documents_fts(documents_fts, id, content) VALUES('delete', old.id, old.content);
        END
      `).run();

            this.db.prepare(`
        CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents
        BEGIN
          INSERT INTO documents_fts(documents_fts, id, content) VALUES('delete', old.id, old.content);
          INSERT INTO documents_fts(id, content) VALUES (new.id, new.content);
        END
      `).run();

            // Populate the FTS table with existing documents
            this.rebuildFtsTable();
        } catch (error) {
            console.error('Error setting up full-text search, falling back to LIKE queries:', error);
        }
    }

    /**
     * Rebuild the FTS table from the documents table to fix corruption
     */
    private rebuildFtsTable(): void {
        if (!this.db) return;

        try {
            // Get count of documents
            const count = this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };

            if (count.count > 0) {
                // Clear existing FTS content
                this.db.prepare('DELETE FROM documents_fts').run();

                // Repopulate from documents table
                this.db.prepare(`
          INSERT INTO documents_fts(id, content)
          SELECT id, content FROM documents
        `).run();

                console.log(`Rebuilt FTS table with ${count.count} documents`);
            }
        } catch (error) {
            console.error('Error rebuilding FTS table:', error);
        }
    }

    /**
     * Ingest a CSV file into the database
     */
    private async ingestCSV(filePath: string): Promise<void> {
        if (!this.db) return;

        const fileName = path.basename(filePath);
        console.log(`Ingesting CSV file: ${fileName}`);

        return new Promise((resolve, reject) => {
            const rows: CSVRow[] = [];

            fs.createReadStream(filePath)
                .pipe(csvParser())
                .on('data', (data: CSVRow) => rows.push(data))
                .on('end', async () => {
                    try {
                        // Process the rows and create document chunks
                        for (let i = 0; i < rows.length; i++) {
                            const row = rows[i];
                            const content = this.formatRowContent(row);
                            const metadata = JSON.stringify({
                                source: fileName,
                                row_index: i,
                                columns: Object.keys(row)
                            });

                            // Create a unique ID for the document
                            const id = this.createDocumentId(fileName, i, content);

                            // Store the document
                            await this.storeDocument({
                                id,
                                content,
                                metadata
                            });
                        }
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    /**
     * Format a CSV row into a readable text content
     */
    private formatRowContent(row: CSVRow): string {
        const lines = Object.entries(row).map(([key, value]) => `${key}: ${value}`);
        return lines.join('\n');
    }

    /**
     * Create a unique document ID based on filename, row index, and content
     */
    private createDocumentId(fileName: string, rowIndex: number, content: string): string {
        const hash = createHash('md5').update(`${fileName}-${rowIndex}-${content}`).digest('hex');
        return hash;
    }

    /**
     * Store a document in the database and generate its embedding
     */
    private async storeDocument(document: DocumentChunk): Promise<void> {
        if (!this.db) return;

        try {
            // Store the document
            this.db.prepare(`
        INSERT OR REPLACE INTO documents (id, content, metadata)
        VALUES (?, ?, ?)
      `).run(document.id, document.content, document.metadata);

            // Try to generate and store embedding
            try {
                if (!this.useFullTextSearch) {
                    const embedding = await this.getEmbedding(document.content);
                    this.db.prepare(`
            INSERT OR REPLACE INTO embeddings (id, document_id, embedding)
            VALUES (?, ?, ?)
          `).run(document.id, document.id, JSON.stringify(embedding));
                }
            } catch (error) {
                console.warn('Error storing embedding, document will use text search only:', error);
                this.embeddingFailureCount++;
            }

        } catch (error) {
            console.error('Error storing document:', error);
            throw error;
        }
    }

    /**
     * Get an embedding for the given text
     */
    private async getEmbedding(text: string): Promise<number[]> {
        try {
            const response = await this.openai.embeddings.create({
                input: text,
                model: 'text-embedding-3-small', // This will use the default model from our local server
            });

            return response.data[0].embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            this.embeddingFailureCount++;
            throw error;
        }
    }

    /**
     * Perform a text-based search using SQLite
     */
    private async textSearch(query: string, limit: number = 3): Promise<RAGSearchResult[]> {
        if (!this.db || !this.isInitialized || !this.hasContent) {
            return [];
        }

        try {
            let results;
            const searchTerms = this.prepareSearchTerms(query);

            // Try to use FTS if available
            try {
                results = this.db.prepare(`
          SELECT id, content,
                 rank
          FROM documents_fts
          WHERE documents_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(searchTerms, limit) as { id: string; content: string; rank: number }[];
            } catch (error) {
                // Check if it's a corruption error
                const errorMessage = String(error);
                if (errorMessage.includes('SQLITE_CORRUPT_VTAB') ||
                    errorMessage.includes('missing row') ||
                    errorMessage.includes('fts5')) {

                    console.warn('FTS corruption detected, attempting to rebuild...');

                    // Try to rebuild the FTS table
                    try {
                        this.rebuildFtsTable();

                        // Try the FTS query again after rebuilding
                        results = this.db.prepare(`
                SELECT id, content,
                       rank
                FROM documents_fts
                WHERE documents_fts MATCH ?
                ORDER BY rank
                LIMIT ?
              `).all(searchTerms, limit) as { id: string; content: string; rank: number }[];

                        console.log('FTS table rebuilt successfully');
                    } catch (rebuildError) {
                        // If rebuild fails too, fall back to LIKE
                        console.error('FTS rebuild failed, falling back to LIKE search:', rebuildError);
                        throw rebuildError; // Propagate to LIKE fallback
                    }
                } else {
                    // Other error, fall back to LIKE
                    console.warn('FTS search failed, falling back to LIKE search:', error);
                    throw error; // Propagate to LIKE fallback
                }
            }

            // If we still don't have results (or error was propagated), use LIKE query
            if (!results) {
                // Create a series of LIKE conditions for better matching
                const terms = query.split(/\s+/).filter(term => term.length > 3);

                if (terms.length === 0) {
                    // If no good terms, just use a simple LIKE with the whole query
                    results = this.db.prepare(`
            SELECT id, content
            FROM documents
            WHERE content LIKE ?
            LIMIT ?
          `).all(`%${query}%`, limit) as { id: string; content: string }[];
                } else {
                    // Use all filtered terms with OR conditions
                    const likeClauses = terms.map(() => 'content LIKE ?').join(' OR ');
                    const likeParams = terms.map(term => `%${term}%`);

                    results = this.db.prepare(`
            SELECT id, content
            FROM documents
            WHERE ${likeClauses}
            LIMIT ?
          `).all(...likeParams, limit) as { id: string; content: string }[];
                }
            }

            // Convert results to match the expected format
            return results.map((doc, index) => ({
                content: doc.content,
                similarity: 1 - (index * 0.1), // Fake similarity scores that decrease with rank
                sourceType: 'text'
            }));
        } catch (error) {
            console.error('Error performing text search:', error);
            return [];
        }
    }

    /**
     * Prepare search terms for FTS query
     */
    private prepareSearchTerms(query: string): string {
        // Extract meaningful terms and format for FTS5
        const terms = query
            .toLowerCase()
            .split(/\s+/)
            .filter(term => term.length > 3)
            .map(term => `"${term}"*`);

        return terms.join(' OR ');
    }

    /**
     * Search for relevant documents based on a query
     */
    public async search(query: string, limit: number = 3): Promise<RAGSearchResult[]> {
        if (!this.db || !this.isInitialized || !this.hasContent) {
            return [];
        }

        try {
            // Increment search counter
            this.searchCount++;

            // If we're configured to use text search or embedding fails, use text search
            if (this.useFullTextSearch) {
                return await this.textSearch(query, limit);
            }

            // Try vector search first
            try {
                // Get query embedding
                const queryEmbedding = await this.getEmbedding(query);

                // Get all documents with embeddings
                const documents = this.db.prepare(`
          SELECT d.id, d.content, e.embedding
          FROM documents d
          JOIN embeddings e ON d.id = e.document_id
        `).all() as { id: string; content: string; embedding: string }[];

                // Calculate similarity scores
                const scoredDocuments = documents.map(doc => {
                    const docEmbedding = JSON.parse(doc.embedding) as number[];
                    const similarity = computeCosineSimilarity(queryEmbedding, docEmbedding);

                    return {
                        id: doc.id,
                        content: doc.content,
                        similarity,
                    };
                });

                // Sort by similarity and take the top results
                const results = scoredDocuments
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, limit)
                    .map(({ content, similarity }) => ({
                        content,
                        similarity,
                        sourceType: 'vector' as const
                    }));

                // Increment match counter if we found results
                if (results.length > 0) {
                    this.matchCount += results.length;
                }

                return results;
            } catch (error) {
                console.warn('Vector search failed, falling back to text search:', error);
                this.embeddingFailureCount++;
                this.useFullTextSearch = true; // Switch to text search for future queries
                return await this.textSearch(query, limit);
            }
        } catch (error) {
            console.error('Error searching for documents:', error);
            return [];
        }
    }

    /**
     * Get RAG usage statistics
     */
    public getRAGStats(): RAGStats {
        return {
            totalSearches: this.searchCount,
            totalMatches: this.matchCount,
            embeddingFailures: this.embeddingFailureCount
        };
    }

    /**
     * Check if RAG has been initialized and has content
     */
    public isReady(): boolean {
        return this.isInitialized && this.hasContent;
    }

    /**
     * Get information about ingested files, checking for newly added files
     */
    public getIngestedFilesInfo(): {
        files: IngestedFileInfo[];
        lastIngestTime: Date | null;
        stats: RAGStats;
    } {
        // Check for new files in the data directory
        this.refreshIngestedFiles();

        return {
            files: [...this.ingestedFiles],
            lastIngestTime: this.lastIngestTime,
            stats: this.getRAGStats()
        };
    }

    /**
     * Check for new files in the data directory and update the ingested files list
     */
    private async refreshIngestedFiles(): Promise<void> {
        try {
            if (!fs.existsSync(this.dataDir)) {
                return;
            }

            const files = fs.readdirSync(this.dataDir).filter(file => file.endsWith('.csv'));
            if (files.length === 0) {
                return;
            }

            const currentFiles = new Set(this.ingestedFiles.map(file => file.fileName));
            let hasChanges = false;

            // Check for new files
            for (const file of files) {
                if (!currentFiles.has(file)) {
                    // New file found
                    hasChanges = true;
                    const filePath = path.join(this.dataDir, file);
                    const fileStats = fs.statSync(filePath);

                    if (this.isInitialized && this.db) {
                        // Ingest the new file
                        console.log(`New file found: ${file}, ingesting...`);
                        await this.ingestCSV(filePath);

                        // Add to ingested files list
                        const ingestTime = new Date();
                        this.ingestedFiles.push({
                            fileName: file,
                            ingestTime
                        });

                        // Update last ingest time
                        this.lastIngestTime = ingestTime;
                    } else {
                        // Just record the file without ingesting
                        this.ingestedFiles.push({
                            fileName: file,
                            ingestTime: fileStats.mtime
                        });

                        // Update last ingest time if needed
                        if (!this.lastIngestTime || fileStats.mtime > this.lastIngestTime) {
                            this.lastIngestTime = fileStats.mtime;
                        }
                    }
                }
            }

            // Check for updated file timestamps
            if (!hasChanges) {
                for (const fileInfo of this.ingestedFiles) {
                    const filePath = path.join(this.dataDir, fileInfo.fileName);
                    if (fs.existsSync(filePath)) {
                        const fileStats = fs.statSync(filePath);
                        if (fileStats.mtime > fileInfo.ingestTime) {
                            // File has been updated
                            hasChanges = true;
                            console.log(`File updated: ${fileInfo.fileName}, reingesting...`);

                            if (this.isInitialized && this.db) {
                                // Reingest the updated file
                                await this.ingestCSV(filePath);

                                // Update timestamp
                                fileInfo.ingestTime = new Date();
                                this.lastIngestTime = fileInfo.ingestTime;
                            } else {
                                // Just update the timestamp
                                fileInfo.ingestTime = fileStats.mtime;
                                if (!this.lastIngestTime || fileStats.mtime > this.lastIngestTime) {
                                    this.lastIngestTime = fileStats.mtime;
                                }
                            }
                        }
                    }
                }
            }

            // Check for removed files
            const currentFileNames = new Set(files);
            this.ingestedFiles = this.ingestedFiles.filter(fileInfo => currentFileNames.has(fileInfo.fileName));

            // If changes were detected and we need to update last ingest time
            if (hasChanges && this.ingestedFiles.length > 0) {
                // Find the most recent ingest time
                const mostRecentIngestTime = new Date(Math.max(
                    ...this.ingestedFiles.map(file => file.ingestTime.getTime())
                ));
                this.lastIngestTime = mostRecentIngestTime;

                // Update content flag
                const count = this.db?.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
                this.hasContent = count.count > 0;
            }
        } catch (error) {
            console.error('Error refreshing ingested files:', error);
        }
    }

    /**
     * Close the database connection
     */
    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Export a singleton instance
const ragService = new RAGService();
export default ragService;