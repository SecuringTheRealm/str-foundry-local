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

export class RAGService {
    private db: Database.Database | null = null;
    private dbPath: string = path.join(process.cwd(), 'rag.db');
    private dataDir: string = path.join(process.cwd(), 'data');
    private openai: OpenAI;
    private isInitialized: boolean = false;
    private hasContent: boolean = false;
    private ingestedFiles: IngestedFileInfo[] = [];
    private lastIngestTime: Date | null = null;

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

            // Generate and store embedding
            const embedding = await this.getEmbedding(document.content);
            this.db.prepare(`
        INSERT OR REPLACE INTO embeddings (id, document_id, embedding)
        VALUES (?, ?, ?)
      `).run(document.id, document.id, JSON.stringify(embedding));
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
            throw error;
        }
    }

    /**
     * Search for relevant documents based on a query
     */
    public async search(query: string, limit: number = 3): Promise<{ content: string; similarity: number }[]> {
        if (!this.db || !this.isInitialized || !this.hasContent) {
            return [];
        }

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
            return scoredDocuments
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit)
                .map(({ content, similarity }) => ({ content, similarity }));
        } catch (error) {
            console.error('Error searching for documents:', error);
            return [];
        }
    }

    /**
     * Check if RAG has been initialized and has content
     */
    public isReady(): boolean {
        return this.isInitialized && this.hasContent;
    }

    /**
     * Get information about ingested files
     */
    public getIngestedFilesInfo(): {
        files: IngestedFileInfo[];
        lastIngestTime: Date | null;
    } {
        return {
            files: [...this.ingestedFiles],
            lastIngestTime: this.lastIngestTime
        };
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