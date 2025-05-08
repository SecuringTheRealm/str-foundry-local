"use client";

import { Agent, WorkflowStage, WorkflowState } from "@/types/chat";
import { useEffect, useState } from "react";
import { IngestedFileInfo, RAGStats } from "@/services/ragService";

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
  const [fileInfo, setFileInfo] = useState<{
    files: IngestedFileInfo[];
    lastIngestTime: Date | null;
    stats: RAGStats;
  }>({
    files: [],
    lastIngestTime: null,
    stats: { totalSearches: 0, totalMatches: 0, embeddingFailures: 0 },
  });

  useEffect(() => {
    // Fetch ingested file information when component mounts
    const fetchFileInfo = async () => {
      try {
        const response = await fetch("/api/rag/files");
        if (response.ok) {
          const data = await response.json();
          // Convert string dates back to Date objects
          const files = data.files.map((file: any) => ({
            ...file,
            ingestTime: new Date(file.ingestTime),
          }));
          const lastIngestTime = data.lastIngestTime
            ? new Date(data.lastIngestTime)
            : null;
          const stats = data.stats || {
            totalSearches: 0,
            totalMatches: 0,
            embeddingFailures: 0,
          };
          setFileInfo({ files, lastIngestTime, stats });
        }
      } catch (error) {
        console.error("Failed to fetch ingested file info:", error);
      }
    };

    fetchFileInfo();

    // Poll every 10 seconds to refresh RAG stats
    const intervalId = setInterval(fetchFileInfo, 10000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

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

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex flex-col gap-3 p-4 bg-white rounded-lg shadow sm:w-1/2">
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
            <div className="text-xs text-[#666666]">
              {getStageDescription()}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4 bg-white rounded-lg shadow sm:w-1/2">
        <h3 className="text-lg font-semibold text-[#FF5800]">
          Knowledge Sources
        </h3>

        {fileInfo.files.length > 0 ? (
          <>
            <div className="text-sm text-[#666666]">
              Last updated:{" "}
              {fileInfo.lastIngestTime
                ? formatDate(fileInfo.lastIngestTime)
                : "Never"}
            </div>

            {/* RAG Usage Statistics */}
            <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
              <div className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-[#FF5800]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <span className="text-xs text-[#666666]">
                  <span className="font-medium">
                    {fileInfo.stats.totalSearches}
                  </span>{" "}
                  RAG searches
                </span>
              </div>
              <div className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-[#FF5800]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-xs text-[#666666]">
                  <span className="font-medium">
                    {fileInfo.stats.totalMatches}
                  </span>{" "}
                  document matches
                </span>
              </div>
            </div>

            <div className="mt-2">
              <h4 className="text-sm font-medium text-[#4C4C4C]">
                Ingested Files:
              </h4>
              <ul className="mt-1 space-y-1">
                {fileInfo.files.map((file, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm text-[#666666]"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4 text-[#FF5800]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>{file.fileName}</span>
                    <span className="text-xs text-[#999999]">
                      ({formatDate(file.ingestTime)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center text-[#666666]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-10 h-10 mb-2 text-[#E5E5E5]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-sm">No files have been ingested yet</p>
            <p className="mt-1 text-xs">
              Place CSV files in the /data folder to enhance research
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentWorkflow;
