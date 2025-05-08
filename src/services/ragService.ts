import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { createHash } from 'crypto';
import sqlite3 from 'sqlite3';
import { pipeline } from '@xenova/transformers';
import cosineSimilarity from 'compute-cosine-similarity';

// We don't need StringDecoder since we're using the built-in normalize method

interface CSVRow {
    [key: string]: string;
}

interface DocumentChunk {
    id: string;
    content: string;
    metadata: string;
}

// Document with similarity score used in vector search
interface DocWithSimilarity {
    id: string;
    content: string;
    metadata: string;
    similarity: number;
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
    sourceType: 'vector' | 'text'; // Add the source type property to match what AgentService expects
}

type DBRow = Record<string, string | number | boolean | null>;

// Type for the embedding model from transformers.js
interface EmbeddingModel {
    (text: string, options?: {
        pooling?: 'mean' | 'cls' | 'none';  // Changed from 'max' to 'none' to match library types
        normalize?: boolean;
    }): Promise<{ data: number[] }>;
}

export class RAGService {
    private _db: sqlite3.Database | null = null;
    private _dataDir: string = path.join(process.cwd(), 'data');
    private _dbPath: string = path.join(process.cwd(), 'rag.db');
    private _isInitialized: boolean = false;
    private _hasContent: boolean = false;
    private _ingestedFiles: IngestedFileInfo[] = [];
    private _lastIngestTime: Date | null = null;
    private _searchCount: number = 0;
    private _matchCount: number = 0;
    private _embeddingFailureCount: number = 0;
    private _embeddingModel: EmbeddingModel | null = null; // Using any as the transformers.js types are complex
    private readonly _embeddingModelName: string = 'Xenova/all-MiniLM-L6-v2';
    private readonly _embeddingDimension: number = 384; // Dimension for the all-MiniLM-L6-v2 model
    private readonly _documentStore: Map<string, { content: string, metadata: string }> = new Map();

    /**
     * Initializes the database and runs a query
     */
    private async _runQuery(query: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this._db) {
                reject(new Error('Database not initialized'));
                return;
            }
            this._db.run(query, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Runs a parameterized query and returns results
     */
    private async _all(query: string, params: (string | number | null)[] = []): Promise<DBRow[]> {
        return new Promise((resolve, reject) => {
            if (!this._db) {
                reject(new Error('Database not initialized'));
                return;
            }
            this._db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows as DBRow[]);
            });
        });
    }

    /**
     * Runs a parameterized statement (insert, update, delete)
     */
    private async _run(query: string, params: (string | number | null)[] = []): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this._db) {
                reject(new Error('Database not initialized'));
                return;
            }
            this._db.run(query, params, function (err) {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Initialize the RAG service by setting up the SQLite database and ingesting data
     */
    public async initialize(): Promise<boolean> {
        try {
            // Check if data directory exists and has files
            if (!fs.existsSync(this._dataDir)) {
                console.log('Data directory does not exist');
                return false;
            }

            const files = fs.readdirSync(this._dataDir).filter(file => file.endsWith('.csv'));
            if (files.length === 0) {
                console.log('No CSV files found in data directory');
                return false;
            }

            // Check if we need to regenerate the vector store
            let regenerateStore = false;

            if (!fs.existsSync(this._dbPath)) {
                regenerateStore = true;
            } else {
                try {
                    // Check if any CSV files are newer than the database
                    const dbStats = fs.statSync(this._dbPath);
                    for (const file of files) {
                        const filePath = path.join(this._dataDir, file);
                        const fileStats = fs.statSync(filePath);
                        if (fileStats.mtime > dbStats.mtime) {
                            console.log(`CSV file ${file} has been updated, regenerating vector store`);
                            regenerateStore = true;
                            break;
                        }
                    }
                } catch (error) {
                    console.error('Error checking file stats:', error);
                    regenerateStore = true;
                }
            }

            // Initialize SQLite database
            this._db = new sqlite3.Database(this._dbPath);

            // Initialize the embedding model
            try {
                // Cast the pipeline result to match our interface
                this._embeddingModel = await pipeline('feature-extraction', this._embeddingModelName) as unknown as EmbeddingModel;
                console.log("Embedding model loaded successfully");
            } catch (error) {
                console.error("Error loading embedding model:", error);
                return false;
            }

            // Create database schema if it doesn't exist
            try {
                // First create the table
                await this._runQuery(`
                    CREATE TABLE IF NOT EXISTS documents (
                        id TEXT PRIMARY KEY,
                        content TEXT NOT NULL,
                        metadata TEXT NOT NULL,
                        embedding TEXT NOT NULL
                    )
                `);

                // Then create the index as a separate statement
                await this._runQuery(`
                    CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(id)
                `);

                // Check if embedding column exists (may be missing in existing databases)
                const tableInfo = await this._all("PRAGMA table_info(documents)");
                const hasEmbeddingColumn = tableInfo.some((col: DBRow) =>
                    col.name === 'embedding'
                );

                if (!hasEmbeddingColumn) {
                    console.log('Adding missing embedding column to documents table');
                    await this._runQuery(`ALTER TABLE documents ADD COLUMN embedding TEXT`);
                    // Force regeneration since we need to add embeddings
                    regenerateStore = true;
                }
            } catch (error) {
                console.error('Error creating schema:', error);
                return false;
            }

            // Create or load the vector store
            if (regenerateStore) {
                // Clear previous ingestion records
                this._ingestedFiles = [];
                this._documentStore.clear();

                // Remove existing database records
                await this._runQuery('DELETE FROM documents');

                // Ingest all CSV files
                for (const file of files) {
                    const filePath = path.join(this._dataDir, file);
                    await this.ingestCSV(filePath);

                    // Record ingestion time and file
                    const ingestTime = new Date();
                    this._ingestedFiles.push({
                        fileName: file,
                        ingestTime
                    });
                    this._lastIngestTime = ingestTime;
                }
            } else {
                // Just load existing documents from the database
                const documents = await this._all('SELECT id, content, metadata FROM documents');

                for (const doc of documents) {
                    this._documentStore.set(doc.id as string, {
                        content: doc.content as string,
                        metadata: doc.metadata as string
                    });
                }

                // Populate the ingested files info based on the files in the data directory
                this._ingestedFiles = files.map(file => {
                    const filePath = path.join(this._dataDir, file);
                    const fileStats = fs.statSync(filePath);
                    return {
                        fileName: file,
                        ingestTime: fileStats.mtime
                    };
                });

                if (this._ingestedFiles.length > 0) {
                    // Set the last ingest time to the most recent file modification
                    this._lastIngestTime = new Date(Math.max(
                        ...this._ingestedFiles.map(file => file.ingestTime.getTime())
                    ));
                }
            }

            // Check if we have content
            this._hasContent = this._documentStore.size > 0;
            this._isInitialized = true;

            return this._hasContent;
        } catch (error) {
            console.error('Error initializing RAG service:', error);
            return false;
        }
    }

    /**
     * Ingest a CSV file into the vector store
     */
    private async ingestCSV(filePath: string): Promise<void> {
        const fileName = path.basename(filePath);
        console.log(`Ingesting CSV file: ${fileName}`);

        return new Promise((resolve, reject) => {
            const rows: CSVRow[] = [];

            fs.createReadStream(filePath, { encoding: 'utf8' })
                .pipe(csvParser({
                    // Add CSV parser options to handle Unicode properly
                    skipLines: 0,
                    strict: true,
                    escape: '"',
                }))
                .on('data', (data: CSVRow) => {
                    // Normalize all string values in the row
                    const normalizedData: CSVRow = {};
                    for (const [key, value] of Object.entries(data)) {
                        normalizedData[key] = typeof value === 'string'
                            ? this.normalizeUnicode(value)
                            : value;
                    }
                    rows.push(normalizedData);
                })
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

                            // Store the document with its embedding
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
     * Normalize Unicode characters to ensure consistent handling
     */
    private normalizeUnicode(text: string): string {
        if (!text) return '';

        try {
            // Normalize to NFC form (Normalization Form Canonical Composition)
            // This ensures characters are decomposed and then recomposed to their canonical form
            const normalized = text.normalize('NFC');

            // Remove any invisible control characters and unused code points
            return normalized.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF\uFFF0-\uFFFF]/g, '');
        } catch (error) {
            console.warn('Error normalizing text:', error);
            // If normalization fails, return original with basic cleanup
            return text.replace(/[\u0000-\u001F\u007F]/g, '');
        }
    }

    /**
     * Format a CSV row into a readable text content
     */
    private formatRowContent(row: CSVRow): string {
        const lines = Object.entries(row).map(([key, value]) => {
            // Ensure value is properly normalized before joining
            const normalizedValue = typeof value === 'string'
                ? this.normalizeUnicode(value)
                : String(value);

            return `${key}: ${normalizedValue}`;
        });
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
     * Store a document in the document store and add its embedding to SQLite
     */
    private async storeDocument(document: DocumentChunk): Promise<void> {
        if (!this._db || !this._embeddingModel) return;

        try {
            // Store document content and metadata
            this._documentStore.set(document.id, {
                content: document.content,
                metadata: document.metadata
            });

            // Generate and store embedding
            try {
                // Generate embedding using transformers.js
                const embedding = await this.getEmbedding(document.content);

                // Store as JSON string in SQLite
                const embeddingJson = JSON.stringify(Array.from(embedding));

                // Insert into SQLite using parameterized query
                await this._run(
                    'INSERT OR REPLACE INTO documents (id, content, metadata, embedding) VALUES (?, ?, ?, ?)',
                    [document.id, document.content, document.metadata, embeddingJson]
                );

            } catch (error) {
                console.error('Error storing embedding:', error);
                this._embeddingFailureCount++;
                throw error;
            }
        } catch (error) {
            console.error('Error storing document:', error);
            throw error;
        }
    }

    /**
     * Get an embedding for the given text
     */
    private async getEmbedding(text: string): Promise<Float32Array> {
        if (!this._embeddingModel) {
            throw new Error('Embedding model not initialized');
        }

        try {
            // Normalize text before sending to embedding model
            const normalizedText = this.normalizeUnicode(text);

            // Get embeddings from transformers.js - using correct pooling options
            const result = await this._embeddingModel(normalizedText, {
                pooling: 'mean',  // Using 'mean' which is compatible
                normalize: true
            });

            // Return as Float32Array
            return new Float32Array(result.data);
        } catch (error) {
            console.error('Error generating embedding:', error);
            this._embeddingFailureCount++;
            throw error;
        }
    }

    /**
     * Perform a vector search using SQLite and cosine similarity
     */
    private async vectorSearch(query: string, limit: number = 3): Promise<RAGSearchResult[]> {
        if (!this._db || !this._isInitialized || !this._hasContent || !this._embeddingModel) {
            return [];
        }

        try {
            // Get query embedding
            const queryEmbedding = await this.getEmbedding(query);
            const queryArray = Array.from(queryEmbedding);

            // Fetch all documents with their embeddings
            // For large datasets, this would be inefficient but works for smaller ones
            const allDocs = await this._all('SELECT id, content, metadata, embedding FROM documents');

            // Calculate similarities and create DocWithSimilarity objects
            const similarities: DocWithSimilarity[] = allDocs.map(doc => {
                const embedding = JSON.parse(doc.embedding as string);
                // Ensure similarity is always a number (fallback to 0 if null)
                const similarity = cosineSimilarity(queryArray, embedding) || 0;

                // Parse metadata to check source
                const metadata = doc.metadata as string;

                return {
                    id: doc.id as string,
                    content: doc.content as string,
                    metadata,
                    similarity
                };
            });

            // Prioritize results from definitions.csv by boosting their similarity score
            const boostedSimilarities = similarities.map(doc => {
                try {
                    const metadataObj = JSON.parse(doc.metadata);
                    // Check if this result is from definitions.csv
                    if (metadataObj?.source === 'definitions.csv') {
                        // Boost the similarity score by 20% (but cap at 1.0)
                        const boostedScore = Math.min(doc.similarity * 1.2, 1.0);
                        return { ...doc, similarity: boostedScore };
                    }
                } catch (error) {
                    console.warn('Error parsing metadata:', error);
                }
                // Return original if not from definitions.csv or if parsing failed
                return doc;
            });

            // Sort by similarity (highest first) and take top 'limit' results
            const topResults = boostedSimilarities
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit);

            // Format results
            return topResults.map(result => ({
                content: result.content,
                similarity: result.similarity,
                sourceType: 'vector' as const // Set the source type to 'vector' for all results from this method
            }));
        } catch (error) {
            console.error('Error performing vector search:', error);
            throw error;
        }
    }

    /**
     * Search for relevant documents based on a query
     */
    public async search(query: string, limit: number = 3): Promise<RAGSearchResult[]> {
        if (!this._db || !this._isInitialized || !this._hasContent) {
            return [];
        }

        try {
            // Increment search counter
            this._searchCount++;

            // Normalize query before searching
            const normalizedQuery = this.normalizeUnicode(query);

            const results = await this.vectorSearch(normalizedQuery, limit);

            // Increment match counter if we found results
            if (results.length > 0) {
                this._matchCount += results.length;
            }

            return results;
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
            totalSearches: this._searchCount,
            totalMatches: this._matchCount,
            embeddingFailures: this._embeddingFailureCount
        };
    }

    /**
     * Check if RAG has been initialized and has content
     */
    public isReady(): boolean {
        return this._isInitialized && this._hasContent;
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
            files: [...this._ingestedFiles],
            lastIngestTime: this._lastIngestTime,
            stats: this.getRAGStats()
        };
    }

    /**
     * Check for new files in the data directory and update the ingested files list
     */
    private async refreshIngestedFiles(): Promise<void> {
        try {
            if (!fs.existsSync(this._dataDir)) {
                return;
            }

            const files = fs.readdirSync(this._dataDir).filter(file => file.endsWith('.csv'));
            if (files.length === 0) {
                return;
            }

            const currentFiles = new Set(this._ingestedFiles.map(file => file.fileName));
            let hasChanges = false;

            // Check for new files
            for (const file of files) {
                if (!currentFiles.has(file)) {
                    // New file found
                    hasChanges = true;
                    const filePath = path.join(this._dataDir, file);
                    const fileStats = fs.statSync(filePath);

                    if (this._isInitialized && this._db) {
                        // Ingest the new file
                        console.log(`New file found: ${file}, ingesting...`);
                        await this.ingestCSV(filePath);

                        // Add to ingested files list
                        const ingestTime = new Date();
                        this._ingestedFiles.push({
                            fileName: file,
                            ingestTime
                        });

                        // Update last ingest time
                        this._lastIngestTime = ingestTime;
                    } else {
                        // Just record the file without ingesting
                        this._ingestedFiles.push({
                            fileName: file,
                            ingestTime: fileStats.mtime
                        });

                        // Update last ingest time if needed
                        if (!this._lastIngestTime || fileStats.mtime > this._lastIngestTime) {
                            this._lastIngestTime = fileStats.mtime;
                        }
                    }
                }
            }

            // Check for updated file timestamps
            if (!hasChanges) {
                for (const fileInfo of this._ingestedFiles) {
                    const filePath = path.join(this._dataDir, fileInfo.fileName);
                    if (fs.existsSync(filePath)) {
                        const fileStats = fs.statSync(filePath);
                        if (fileStats.mtime > fileInfo.ingestTime) {
                            // File has been updated
                            hasChanges = true;
                            console.log(`File updated: ${fileInfo.fileName}, reingesting...`);

                            if (this._isInitialized && this._db) {
                                // Reingest the updated file
                                await this.ingestCSV(filePath);

                                // Update timestamp
                                fileInfo.ingestTime = new Date();
                                this._lastIngestTime = fileInfo.ingestTime;
                            } else {
                                // Just update the timestamp
                                fileInfo.ingestTime = fileStats.mtime;
                                if (!this._lastIngestTime || fileStats.mtime > this._lastIngestTime) {
                                    this._lastIngestTime = fileStats.mtime;
                                }
                            }
                        }
                    }
                }
            }

            // Check for removed files
            const currentFileNames = new Set(files);
            this._ingestedFiles = this._ingestedFiles.filter(fileInfo => currentFileNames.has(fileInfo.fileName));

            // If changes were detected and we need to update last ingest time
            if (hasChanges && this._ingestedFiles.length > 0) {
                // Find the most recent ingest time
                const mostRecentIngestTime = new Date(Math.max(
                    ...this._ingestedFiles.map(file => file.ingestTime.getTime())
                ));
                this._lastIngestTime = mostRecentIngestTime;

                // Update content flag
                this._hasContent = this._documentStore.size > 0;
            }
        } catch (error) {
            console.error('Error refreshing ingested files:', error);
        }
    }

    /**
     * Close the database connection
     */
    public async close(): Promise<void> {
        if (this._db) {
            return new Promise((resolve, reject) => {
                this._db?.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                        reject(err);
                    } else {
                        this._db = null;
                        resolve();
                    }
                });
            });
        }
    }
}

// Export a singleton instance
const ragService = new RAGService();
export default ragService;