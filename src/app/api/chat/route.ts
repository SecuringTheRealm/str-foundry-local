import { NextRequest } from 'next/server';
import { AgentService } from '@/services/agentService';
import { WorkflowState } from '@/types/chat';

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

      // Return the stream directly with metadata headers
      return new Response(stream, {
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

      // If we need to advance the workflow automatically based on the current stage
      let advanceResult = null;
      let updatedState: Partial<WorkflowState> = {};

      if (workflowState) {
        switch (workflowState.stage) {
          case 'inquiry':
            // Check if the message might indicate a topic selection
            if (message.length > 10 ||
              reply.toLowerCase().includes('i can research') ||
              reply.toLowerCase().includes('i will research') ||
              reply.toLowerCase().includes("i'll research")) {

              // Try to extract the topic from the reply or use the message as a fallback
              let topic = message;
              const topicMatch = reply.match(/research\s+["'](.+?)["']/i);
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
            if (reply.length > 100) { // Assume it's substantial research if longer than 100 chars
              updatedState = {
                researchNotes: reply,
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
            if (reply.length > 200) { // Assume it's a draft if longer than 200 chars
              updatedState = {
                draft: reply,
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
              feedback: reply,
              finalContent: workflowState.draft, // Store the draft as final content initially
              stage: 'complete'
            };
            break;
        }
      }

      return new Response(
        JSON.stringify({
          reply,
          updatedState,
          autoAdvance: advanceResult,
          ragReferences,
          ragSearchMade
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error in chat API:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred while processing your request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}