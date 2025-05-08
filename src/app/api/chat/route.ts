import { NextRequest } from 'next/server';
import { AgentService } from '@/services/agentService';
import { WorkflowState } from '@/types/chat';

/**
 * Sanitizes a ReadableStream to handle Unicode characters
 * @param stream The original ReadableStream
 * @returns A new ReadableStream with sanitized text
 */
const sanitizeStreamForUnicode = (stream: ReadableStream): ReadableStream => {
  const reader = stream.getReader();

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            break;
          }

          // Convert to string, sanitize, and convert back to Uint8Array
          const text = new TextDecoder().decode(value);
          const sanitized = sanitizeTextForUnicode(text);

          controller.enqueue(new TextEncoder().encode(sanitized));
        }
      } catch (error) {
        console.error('Error sanitizing stream:', error);
        controller.error(error);
      }
    }
  });
};

/**
 * Sanitizes text to handle Unicode characters
 * @param text The text to sanitize
 * @returns Sanitized text with problematic Unicode characters replaced
 */
const sanitizeTextForUnicode = (text: string): string => {
  return text
    .normalize('NFC')  // Normalize Unicode
    .replace(/[\u0080-\uFFFF]/g, (ch) => {
      // Replace Unicode chars with ASCII equivalents where possible
      // Common replacements for curly quotes and other problematic chars
      const replacements: Record<string, string> = {
        '\u2018': "'", // Left single quote
        '\u2019': "'", // Right single quote
        '\u201C': '"', // Left double quote
        '\u201D': '"', // Right double quote
        '\u2013': '-', // En dash
        '\u2014': '--', // Em dash
        '\u2026': '...', // Ellipsis
      };

      return replacements[ch] || ch.charCodeAt(0) <= 255 ? ch : '?';
    });
};

// Initialize agent service
const agentService = new AgentService();

export async function POST(request: NextRequest) {
  try {
    const { message, systemPrompt, history, agentId, workflowState } = await request.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the stream flag from request headers or body
    const useStream = request.headers.get('x-use-stream') === 'true';

    if (useStream) {
      // Process the message using our agent service with streaming
      const { stream, ragReferences, ragSearchMade } = await agentService.streamMessage({
        message,
        systemPrompt,
        history,
        agentId,
        workflowState,
      });

      // Sanitize the stream to handle Unicode characters
      const sanitizedStream = sanitizeStreamForUnicode(stream);

      // Return the sanitized stream with metadata headers
      return new Response(sanitizedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Rag-References': ragReferences ? JSON.stringify(ragReferences) : '',
          'X-Rag-Search-Made': ragSearchMade ? 'true' : 'false',
        },
      });
    } else {
      // Process the message using our agent service normally
      const { content: reply, ragReferences, ragSearchMade } = await agentService.processMessage({
        message,
        systemPrompt,
        history,
        agentId,
        workflowState,
      });

      // Sanitize the reply to handle Unicode characters
      const sanitizedReply = sanitizeTextForUnicode(reply);

      // If we need to advance the workflow automatically based on the current stage
      let advanceResult = null;
      let updatedState: Partial<WorkflowState> = {};

      if (workflowState) {
        switch (workflowState.stage) {
          case 'inquiry':
            // Check if the message might indicate a topic selection
            if (message.length > 10 ||
              sanitizedReply.toLowerCase().includes('i can research') ||
              sanitizedReply.toLowerCase().includes('i will research') ||
              sanitizedReply.toLowerCase().includes("i'll research")) {

              // Try to extract the topic from the reply or use the message as a fallback
              let topic = message;
              const topicMatch = sanitizedReply.match(/research\s+["'](.+?)["']/i);
              if (topicMatch && topicMatch[1]) {
                topic = topicMatch[1];
              }

              updatedState = {
                topic: topic,
                stage: 'research'
              };
            }
            break;

          case 'research':
            // Set research notes from the reply for the copywriter
            if (sanitizedReply.length > 100) { // Assume it's substantial research if longer than 100 chars
              updatedState = {
                researchNotes: sanitizedReply,
                stage: 'writing'
              };

              // Get an automatic response from the copywriter
              advanceResult = await agentService.advanceWorkflow({
                workflowState: { ...workflowState, ...updatedState } as WorkflowState,
                history
              });
            }
            break;

          case 'writing':
            // Set draft from the reply for the reviewer
            if (sanitizedReply.length > 200) { // Assume it's a draft if longer than 200 chars
              updatedState = {
                draft: sanitizedReply,
                stage: 'review'
              };

              // Get an automatic response from the reviewer
              advanceResult = await agentService.advanceWorkflow({
                workflowState: { ...workflowState, ...updatedState } as WorkflowState,
                history
              });
            }
            break;

          case 'review':
            // Set feedback and prepare final content
            updatedState = {
              feedback: sanitizedReply,
              finalContent: workflowState.draft, // Store the draft as final content initially
              stage: 'complete'
            };
            break;
        }
      }

      return new Response(
        JSON.stringify({
          reply: sanitizedReply,
          updatedState,
          autoAdvance: advanceResult,
          ragReferences,
          ragSearchMade
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    console.error('Error in chat API:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while processing your request';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}