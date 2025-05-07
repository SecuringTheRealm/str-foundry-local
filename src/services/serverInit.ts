import ragService from './ragService';

/**
 * Global flag to track initialization status
 */
let isInitialized = false;

/**
 * Initialize server-side services
 * This function will only run initialization once even if called multiple times
 */
export const initialize = async (): Promise<void> => {
    // Prevent multiple initializations
    if (isInitialized) {
        return;
    }

    try {
        console.log('🔍 Initializing RAG service...');
        const ragInitialized = await ragService.initialize();

        if (ragInitialized) {
            console.log('✅ RAG service initialized successfully');
            const fileInfo = ragService.getIngestedFilesInfo();
            console.log(`📚 Ingested ${fileInfo.files.length} files for RAG`);
        } else {
            console.log('⚠️ RAG service initialized but no content available');
        }

        isInitialized = true;
    } catch (error) {
        console.error('❌ Error initializing server:', error);
    }
};

/**
 * Check if the server has been initialized
 */
export const isServerInitialized = (): boolean => {
    return isInitialized;
};