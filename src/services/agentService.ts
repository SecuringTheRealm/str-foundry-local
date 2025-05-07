import { OpenAI } from 'openai';
import { Message, WorkflowState, Role, RAGReference } from '@/types/chat';
import ragService, { RAGSearchResult } from './ragService';

// Initialize OpenAI client with the API key and endpoint from environment variables
const openai = new OpenAI({
  apiKey: 'not-needed-for-local',
  baseURL: 'http://localhost:5272/v1',
});

export interface ChatRequest {
  message: string;
  systemPrompt: string;
  history: Message[];
  agentId: string;
  workflowState?: WorkflowState;
}

export class AgentService {
  private agentPrompts = {
    concierge: `You are the Concierge agent, designed to help users identify topics they'd like to explore further.
Your primary goal is to understand what the user is interested in and help define a clear research topic.
Once you've identified a potential topic, propose it to the user clearly.
Keep your responses conversational, friendly, and helpful.
Ask clarifying questions when needed to narrow down the topic.`,

    conciergeWithRag: `You are the Concierge agent, designed to help users identify topics they'd like to explore further.
Your primary goal is to understand what the user is interested in and help define a clear research topic.
Once you've identified a potential topic, propose it to the user clearly.
Keep your responses conversational, friendly, and helpful.
Ask clarifying questions when needed to narrow down the topic.

Use the provided relevant documents to suggest potential research topics that match what's available in our knowledge base.
Refer to this information to help guide the user toward topics where we have good data available.`,

    researcher: `You are the Researcher agent, designed to gather information on a specific topic.
Your goal is to collect key information, statistics, and insights that will be useful for content creation.
Focus on relevant facts, important context, and valuable details.
Be thorough in your research and present information in a structured way.
If you don't know something, acknowledge that and focus on what you do know.`,

    researcherWithRag: `You are the Researcher agent, designed to gather information on a specific topic.
Your goal is to collect key information, statistics, and insights that will be useful for content creation.
Focus on relevant facts, important context, and valuable details.
Be thorough in your research and present information in a structured way.
If you don't know something, acknowledge that and focus on what you do know.

Use the provided relevant documents as your primary source of information on this topic.
Extract key insights, statistics, and factual information from these documents to create comprehensive research notes.`,

    copywriter: `You are the Copywriter agent, designed to turn research into compelling content.
Your goal is to craft engaging, well-structured content based on the research notes provided.
Focus on creating a clear narrative that flows logically and keeps the reader engaged.
Use appropriate headings, paragraphs, and formatting to improve readability.
Be creative while staying true to the facts from the research.`,

    reviewer: `You are the Reviewer agent, designed to provide feedback on drafted content.
Your goal is to help improve the draft by identifying areas for enhancement and correction.
Focus on clarity, accuracy, flow, and overall effectiveness of the content.
Provide constructive criticism and specific suggestions for improvement.
Be thorough but respectful, acknowledging the strengths of the work while proposing enhancements.`,

    reviewerWithRag: `You are the Reviewer agent, designed to provide feedback on drafted content.
Your goal is to help improve the draft by identifying areas for enhancement and correction.
Focus on clarity, accuracy, flow, and overall effectiveness of the content.
Provide constructive criticism and specific suggestions for improvement.
Be thorough but respectful, acknowledging the strengths of the work while proposing enhancements.

Use the provided relevant documents to fact-check the draft and ensure accuracy.
If you find any inconsistencies between the draft and the source materials, highlight them in your feedback.
Suggest ways to incorporate additional relevant information from the source documents if it would strengthen the content.`
  };

  private isRagInitialized: boolean = false;

  constructor() {
    // Initialize RAG service asynchronously
    this.initializeRag();
  }

  /**
   * Initialize the RAG service
   */
  private async initializeRag(): Promise<void> {
    try {
      this.isRagInitialized = await ragService.initialize();
      console.log(`RAG service initialized with content: ${this.isRagInitialized}`);
    } catch (error) {
      console.error('Failed to initialize RAG service:', error);
      this.isRagInitialized = false;
    }
  }

  /**
   * Process RAG search results and extract references
   */
  private processRAGResults(results: RAGSearchResult[]): {
    relevantDocuments: string;
    ragReferences: RAGReference[];
  } {
    const relevantDocuments = results.map(doc => doc.content).join('\n\n');
    const ragReferences: RAGReference[] = [];

    // Extract document metadata for display
    results.forEach(doc => {
      try {
        const metadataStr = doc.content.split('\n')[0]; // Assuming first line has metadata
        const documentName = metadataStr.includes(':') ?
          metadataStr.split(':')[1].trim() : 'Unknown';

        // Extract a unique ID from the content or use a hash
        const rowIdMatch = doc.content.match(/Row ID: (\d+)/i);
        const rowId = rowIdMatch ? rowIdMatch[1] :
          `doc-${Math.random().toString(36).substring(2, 10)}`;

        ragReferences.push({
          documentName,
          rowId,
          similarity: doc.similarity,
          sourceType: doc.sourceType,
        });
      } catch (err) {
        console.error('Error processing RAG document metadata:', err);
      }
    });

    return { relevantDocuments, ragReferences };
  }

  /**
   * Enhance a prompt with RAG results if available
   *
   * @param searchQuery The query to search for in the RAG system
   * @param basePrompt The base prompt to enhance
   * @param ragPrompt The RAG-enhanced version of the prompt
   * @returns Object containing the enhanced prompt and RAG info
   */
  private async enhancePromptWithRAG(
    searchQuery: string,
    basePrompt: string,
    ragPrompt: string
  ): Promise<{
    promptToUse: string;
    relevantDocuments: string;
    ragReferences: RAGReference[];
    ragSearchMade: boolean;
  }> {
    let promptToUse = basePrompt;
    let relevantDocuments = '';
    let ragReferences: RAGReference[] = [];
    let ragSearchMade = false;

    if (!this.isRagInitialized) {
      return { promptToUse, relevantDocuments, ragReferences, ragSearchMade };
    }

    try {
      ragSearchMade = true; // Mark that a search was attempted
      const results = await ragService.search(searchQuery, 3);

      if (results.length > 0) {
        const processedResults = this.processRAGResults(results);
        relevantDocuments = processedResults.relevantDocuments;
        ragReferences = processedResults.ragReferences;

        promptToUse = `${ragPrompt}\n\nRelevant documents:\n${relevantDocuments}`;
      }
    } catch (error) {
      console.error('Error using RAG for prompt enhancement:', error);
    }

    return { promptToUse, relevantDocuments, ragReferences, ragSearchMade };
  }

  /**
   * Processes a user message and generates a response based on the current workflow state
   */
  async processMessage(request: ChatRequest): Promise<{
    content: string;
    ragReferences?: RAGReference[];
    ragSearchMade?: boolean;
  }> {
    const { message, systemPrompt, history, agentId, workflowState } = request;

    try {
      // Determine which agent should respond based on the workflow stage
      let currentAgentRole: Role = 'agent';
      let promptToUse = systemPrompt || 'You are a helpful AI assistant.';
      let relevantDocuments: string = '';
      let ragReferences: RAGReference[] = [];
      let ragSearchMade = false;

      if (workflowState) {
        switch (workflowState.stage) {
          case 'inquiry':
            currentAgentRole = 'concierge';
            // Use RAG to help with topic suggestions based on available knowledge
            const conciergeRagResult = await this.enhancePromptWithRAG(
              message,
              this.agentPrompts.concierge,
              this.agentPrompts.conciergeWithRag
            );
            promptToUse = conciergeRagResult.promptToUse;
            ragReferences = conciergeRagResult.ragReferences;
            ragSearchMade = conciergeRagResult.ragSearchMade;
            break;

          case 'research':
            currentAgentRole = 'researcher';
            // Use RAG to enhance research with relevant documents
            if (workflowState.topic) {
              const researchRagResult = await this.enhancePromptWithRAG(
                workflowState.topic,
                this.agentPrompts.researcher + `\nThe topic to research is: ${workflowState.topic}`,
                this.agentPrompts.researcherWithRag + `\nThe topic to research is: ${workflowState.topic}`
              );
              promptToUse = researchRagResult.promptToUse;
              ragReferences = researchRagResult.ragReferences;
              ragSearchMade = researchRagResult.ragSearchMade;
            } else {
              promptToUse = this.agentPrompts.researcher;
            }
            break;

          case 'writing':
            currentAgentRole = 'copywriter';
            promptToUse = this.agentPrompts.copywriter + `\nHere are the research notes to use:\n${workflowState.researchNotes}`;
            break;

          case 'review':
            currentAgentRole = 'reviewer';
            // Use RAG to help with fact-checking during review
            if (workflowState.draft) {
              const reviewRagResult = await this.enhancePromptWithRAG(
                workflowState.draft,
                this.agentPrompts.reviewer + `\nHere is the draft to review:\n${workflowState.draft}`,
                this.agentPrompts.reviewerWithRag + `\nHere is the draft to review:\n${workflowState.draft}`
              );
              promptToUse = reviewRagResult.promptToUse;
              ragReferences = reviewRagResult.ragReferences;
              ragSearchMade = reviewRagResult.ragSearchMade;
            } else {
              promptToUse = this.agentPrompts.reviewer;
            }
            break;
        }
      }

      // Convert history to OpenAI format
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'agent' || msg.role === 'concierge' || msg.role === 'researcher' ||
          msg.role === 'copywriter' || msg.role === 'reviewer' ? 'assistant' : msg.role,
        content: msg.content,
      }));

      // Create a conversation with system prompt and history
      const messages = [
        { role: 'system', content: promptToUse },
        ...formattedHistory,
        { role: 'user', content: message },
      ];

      // Call OpenAI API for chat completion
      const completion = await openai.chat.completions.create({
        model: process.env.FOUNDRY_LOCAL_MODEL || 'Phi-4-mini-cpu-int4-rtn-block-32-acc-level-4-onnx', // Use the deployment name as the model
        messages: messages as any,
        //temperature: 0.7,
        max_tokens: 1500,
      });

      // Extract the response from the completion
      console.log('model:', process.env.FOUNDRY_LOCAL_MODEL || 'Phi-4-mini-cpu-int4-rtn-block-32-acc-level-4-onnx');

      const responseContent = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

      return {
        content: responseContent,
        ragReferences: ragReferences.length > 0 ? ragReferences : undefined,
        ragSearchMade: ragSearchMade,
      };
    } catch (error: any) {
      console.error('Error processing message:', error);
      return {
        content: `Error: ${error.message || 'An unknown error occurred'}`,
      };
    }
  }

  /**
   * Processes a user message and returns a stream for real-time UI updates
   */
  async streamMessage(request: ChatRequest): Promise<{
    stream: ReadableStream<Uint8Array>;
    ragReferences?: RAGReference[];
    ragSearchMade?: boolean;
  }> {
    const { message, systemPrompt, history, agentId, workflowState } = request;

    // Create a transform stream to process the OpenAI stream
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Create a stream to send to the client
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    try {
      // Determine which agent should respond based on the workflow stage
      let currentAgentRole: Role = 'agent';
      let promptToUse = systemPrompt || 'You are a helpful AI assistant.';
      let relevantDocuments: string = '';
      let ragReferences: RAGReference[] = [];
      let ragSearchMade = false;

      if (workflowState) {
        switch (workflowState.stage) {
          case 'inquiry':
            currentAgentRole = 'concierge';
            // Use RAG to help with topic suggestions based on available knowledge
            const conciergeRagResult = await this.enhancePromptWithRAG(
              message,
              this.agentPrompts.concierge,
              this.agentPrompts.conciergeWithRag
            );
            promptToUse = conciergeRagResult.promptToUse;
            ragReferences = conciergeRagResult.ragReferences;
            ragSearchMade = conciergeRagResult.ragSearchMade;
            break;

          case 'research':
            currentAgentRole = 'researcher';
            // Use RAG to enhance research with relevant documents
            if (workflowState.topic) {
              const researchRagResult = await this.enhancePromptWithRAG(
                workflowState.topic,
                this.agentPrompts.researcher + `\nThe topic to research is: ${workflowState.topic}`,
                this.agentPrompts.researcherWithRag + `\nThe topic to research is: ${workflowState.topic}`
              );
              promptToUse = researchRagResult.promptToUse;
              ragReferences = researchRagResult.ragReferences;
              ragSearchMade = researchRagResult.ragSearchMade;
            } else {
              promptToUse = this.agentPrompts.researcher;
            }
            break;

          case 'writing':
            currentAgentRole = 'copywriter';
            promptToUse = this.agentPrompts.copywriter + `\nHere are the research notes to use:\n${workflowState.researchNotes}`;
            break;

          case 'review':
            currentAgentRole = 'reviewer';
            // Use RAG to help with fact-checking during review
            if (workflowState.draft) {
              const reviewRagResult = await this.enhancePromptWithRAG(
                workflowState.draft,
                this.agentPrompts.reviewer + `\nHere is the draft to review:\n${workflowState.draft}`,
                this.agentPrompts.reviewerWithRag + `\nHere is the draft to review:\n${workflowState.draft}`
              );
              promptToUse = reviewRagResult.promptToUse;
              ragReferences = reviewRagResult.ragReferences;
              ragSearchMade = reviewRagResult.ragSearchMade;
            } else {
              promptToUse = this.agentPrompts.reviewer;
            }
            break;
        }
      }

      // Convert history to OpenAI format
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'agent' || msg.role === 'concierge' || msg.role === 'researcher' ||
          msg.role === 'copywriter' || msg.role === 'reviewer' ? 'assistant' : msg.role,
        content: msg.content,
      }));

      // Create a conversation with system prompt and history
      const messages = [
        { role: 'system', content: promptToUse },
        ...formattedHistory,
        { role: 'user', content: message },
      ];

      console.log('model:', process.env.FOUNDRY_LOCAL_MODEL || 'Phi-4-mini-cpu-int4-rtn-block-32-acc-level-4-onnx');

      // Call OpenAI API for streaming chat completion
      const openaiStream = await openai.chat.completions.create({
        model: process.env.FOUNDRY_LOCAL_MODEL || 'Phi-4-mini-cpu-int4-rtn-block-32-acc-level-4-onnx',
        messages: messages as any,
        max_tokens: 1500,
        stream: true,
      });

      // Process the stream and forward it to the client
      (async () => {
        let fullResponse = '';

        try {
          for await (const chunk of openaiStream) {
            const content = chunk.choices[0]?.delta?.content || '';
            fullResponse += content;

            // Send the content chunk to the client
            await writer.write(encoder.encode(content));
          }

          // Send the full response in a special "done" message
          const doneMessage = JSON.stringify({ done: true, fullResponse });
          await writer.write(encoder.encode(`\n${doneMessage}`));
        } catch (error) {
          console.error('Error streaming response:', error);
          const errorMessage = JSON.stringify({ error: 'Error streaming response' });
          await writer.write(encoder.encode(`\n${errorMessage}`));
        } finally {
          await writer.close();
        }
      })();

      return {
        stream: stream.readable,
        ragReferences: ragReferences.length > 0 ? ragReferences : undefined,
        ragSearchMade: ragSearchMade,
      };
    } catch (error: any) {
      console.error('Error setting up stream:', error);
      const errorMessage = `Error: ${error.message || 'An unknown error occurred'}`;
      await writer.write(encoder.encode(errorMessage));
      await writer.close();
      return {
        stream: stream.readable
      };
    }
  }

  /**
   * Automatically advances the workflow to the next stage without user input
   */
  async advanceWorkflow(request: {
    workflowState: WorkflowState;
    history: Message[];
  }): Promise<{ response: string; updatedState: Partial<WorkflowState> }> {
    const { workflowState, history } = request;
    let response = '';
    let updatedState: Partial<WorkflowState> = {};

    try {
      switch (workflowState.stage) {
        case 'inquiry':
          // Extract topic from the conversation
          updatedState = {
            stage: 'research',
            topic: workflowState.topic
          };
          response = `I'll research "${workflowState.topic}" for you now.`;
          break;

        case 'research':
          // Transition from research to writing
          updatedState = {
            stage: 'writing',
            researchNotes: workflowState.researchNotes
          };
          response = `Research complete. I'm now drafting content about "${workflowState.topic}".`;
          break;

        case 'writing':
          // Transition from writing to review
          updatedState = {
            stage: 'review',
            draft: workflowState.draft
          };
          response = `Draft complete. Now reviewing the content.`;
          break;

        case 'review':
          // Transition from review to complete
          updatedState = {
            stage: 'complete',
            finalContent: workflowState.finalContent
          };
          response = `Review complete. The final content is ready.`;
          break;
      }

      return { response, updatedState };
    } catch (error: any) {
      console.error('Error advancing workflow:', error);
      return {
        response: `Error: ${error.message || 'An unknown error occurred'}`,
        updatedState: {}
      };
    }
  }
}