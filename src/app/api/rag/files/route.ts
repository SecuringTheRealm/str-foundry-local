import { NextRequest } from 'next/server';
import ragService from '@/services/ragService';

export async function GET(request: NextRequest) {
    try {
        // Get file information from the RAG service
        const fileInfo = ragService.getIngestedFilesInfo();

        // Return the file information as JSON
        return new Response(
            JSON.stringify(fileInfo),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        console.error('Error in rag/files API:', error);
        return new Response(
            JSON.stringify({ error: error.message || 'An error occurred while retrieving file information' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}