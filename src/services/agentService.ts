import { OpenAI } from 'openai';
import { Message, WorkflowState, Role } from '@/types/chat';

// Initialize Azure OpenAI client with the API key and endpoint from environment variables
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
    concierge: `You are a helpful Concierge agent. Your job is to inquire about what topic the user would like to learn about.
Ask thoughtful questions to understand the user's interests and needs.
Once you have a clear understanding of what the user wants, summarize it concisely and confirm that's what they want.
Your goal is to help define a clear topic for research.`,

    researcher: `You are a Researcher agent. You have been given a topic to research.
Present comprehensive, factual information about the topic.
Include relevant data, historical context, current developments, and different perspectives.
Organize your research in clear sections with important points highlighted.
Cite sources where appropriate, and mention any areas where information might be limited or uncertain.
Keep your tone informative and objective.`,

    copywriter: `You are a Copywriter agent. You have been given research notes on a topic.
Transform these notes into engaging, well-written content.
Structure the content with clear headings, an introduction, main sections, and a conclusion.
Use an appropriate tone for the subject matter and intended audience.
Make complex information accessible while maintaining accuracy.
Your writing should be polished, error-free, and ready for publication.`,

    reviewer: `You are a Reviewer agent. You have been given a draft of written content to review.
Provide constructive criticism focusing on:
- Content accuracy and completeness
- Structure and flow
- Language usage and clarity
- Audience appropriateness
- Overall impact and effectiveness
Suggest specific improvements with examples where possible.
Be thorough but respectful, acknowledging the strengths of the work while proposing enhancements.`
  };

  /**
   * Processes a user message and generates a response based on the current workflow state
   */
  async processMessage(request: ChatRequest): Promise<string> {
    const { message, systemPrompt, history, agentId, workflowState } = request;

    try {
      // Determine which agent should respond based on the workflow stage
      let currentAgentRole: Role = 'agent';
      let promptToUse = systemPrompt || 'You are a helpful AI assistant.';

      if (workflowState) {
        switch (workflowState.stage) {
          case 'inquiry':
            currentAgentRole = 'concierge';
            promptToUse = this.agentPrompts.concierge;
            break;
          case 'research':
            currentAgentRole = 'researcher';
            promptToUse = this.agentPrompts.researcher + `\nThe topic to research is: ${workflowState.topic}`;
            break;
          case 'writing':
            currentAgentRole = 'copywriter';
            promptToUse = this.agentPrompts.copywriter + `\nHere are the research notes to use:\n${workflowState.researchNotes}`;
            break;
          case 'review':
            currentAgentRole = 'reviewer';
            promptToUse = this.agentPrompts.reviewer + `\nHere is the draft to review:\n${workflowState.draft}`;
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

      // Call Azure OpenAI API for chat completion
      const completion = await openai.chat.completions.create({
        model: process.env.FOUNDRY_LOCAL_MODEL || 'Phi-4-mini-cpu-int4-rtn-block-32-acc-level-4-onnx', // Use the deployment name as the model
        messages: messages as any,
        //temperature: 0.7,
        max_tokens: 1500,
      });

      // Extract the response from the completion
      console.log('model:', process.env.FOUNDRY_LOCAL_MODEL || 'Phi-4-mini-cpu-int4-rtn-block-32-acc-level-4-onnx');

      return completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
    } catch (error: any) {
      console.error('Error processing message:', error);
      return `Error: ${error.message || 'An unknown error occurred'}`;
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