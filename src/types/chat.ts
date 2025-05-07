export type Role = 'user' | 'system' | 'agent' | 'concierge' | 'researcher' | 'copywriter' | 'reviewer';

export interface RAGReference {
  documentName: string;
  rowId: string;
  similarity: number;
  sourceType: 'vector' | 'text'; // Added source type to track search method
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  agentId?: string; // Track which agent sent the message
  thoughtProcess?: string; // Store the thought process content (<think>...</think>)
  isThinking?: boolean; // Flag to indicate if currently in thinking mode
  ragReferences?: RAGReference[]; // Store RAG document references if used
  ragSearchMade?: boolean; // Flag to indicate a RAG search was attempted, even if no results
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isActive: boolean;
}

export type WorkflowStage = 'inquiry' | 'research' | 'writing' | 'review' | 'complete';

export interface WorkflowState {
  stage: WorkflowStage;
  topic?: string;
  researchNotes?: string;
  draft?: string;
  feedback?: string;
  finalContent?: string;
}