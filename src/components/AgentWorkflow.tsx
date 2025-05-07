"use client";

import { Agent, WorkflowStage, WorkflowState } from "@/types/chat";

interface AgentWorkflowProps {
  agents: Agent[];
  workflowState: WorkflowState;
  onStageComplete: (newState: Partial<WorkflowState>) => void;
}

const AgentWorkflow = ({
  agents,
  workflowState,
  onStageComplete,
}: AgentWorkflowProps) => {
  // Find the current active agent based on workflow stage
  const getActiveAgentName = (): string => {
    switch (workflowState.stage) {
      case "inquiry":
        return "Concierge";
      case "research":
        return "Researcher";
      case "writing":
        return "Copywriter";
      case "review":
        return "Reviewer";
      case "complete":
        return "Complete";
      default:
        return "Concierge";
    }
  };

  const getStageDescription = (): string => {
    switch (workflowState.stage) {
      case "inquiry":
        return "The Concierge agent is asking you about your topic of interest";
      case "research":
        return `The Researcher agent is gathering information about "${workflowState.topic}"`;
      case "writing":
        return "The Copywriter agent is crafting your content";
      case "review":
        return "The Reviewer agent is providing feedback on the draft";
      case "complete":
        return "Your content is ready!";
      default:
        return "Starting conversation";
    }
  };

  const getProgressPercentage = (): number => {
    const stages: WorkflowStage[] = [
      "inquiry",
      "research",
      "writing",
      "review",
      "complete",
    ];
    const currentIndex = stages.indexOf(workflowState.stage);
    return Math.round((currentIndex / (stages.length - 1)) * 100);
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold text-[#FF5800]">
        Multi-Agent Workflow
      </h3>

      <div className="flex items-center gap-2">
        <div className="relative w-full h-2 bg-[#E5E5E5] rounded-full">
          <div
            className="absolute top-0 left-0 h-2 bg-[#FF5800] rounded-full"
            style={{ width: `${getProgressPercentage()}%` }}
          ></div>
        </div>
        <span className="text-sm font-medium text-[#666666]">
          {getProgressPercentage()}%
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FFB314] bg-opacity-20 text-[#FF5800]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div>
          <div className="text-sm font-medium text-[#333333]">
            Active: {getActiveAgentName()}
          </div>
          <div className="text-xs text-[#666666]">{getStageDescription()}</div>
        </div>
      </div>
    </div>
  );
};

export default AgentWorkflow;
