"use client";

import { Message, WorkflowState } from "@/types/chat";
import { useState } from "react";

interface ExportButtonProps {
  messages: Message[];
  workflowState: WorkflowState;
}

const ExportButton = ({ messages, workflowState }: ExportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).format(date);
  };

  const handleExport = () => {
    if (messages.length === 0) return;

    setIsExporting(true);

    try {
      // Format the conversation for export
      const title = workflowState.topic
        ? `Conversation about "${workflowState.topic}"`
        : "Foundry Local Document Generation";

      const timestamp = formatDate(new Date());

      let content = `# ${title}\n`;
      content += `Exported on: ${timestamp}\n\n`;
      content += `## Conversation\n\n`;

      messages.forEach((msg) => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        const time = formatDate(new Date(msg.timestamp));

        content += `### ${role} (${time})\n\n`;
        content += `${msg.content}\n\n`;
      });

      if (workflowState.stage === "complete" && workflowState.finalContent) {
        content += `## Final Content\n\n`;
        content += workflowState.finalContent;
      }

      // Create blob and download
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${
        new Date().toISOString().split("T")[0]
      }.md`;
      a.click();

      // Clean up
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting conversation:", error);
      alert(
        "There was an error exporting your conversation. Please try again."
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting || messages.length === 0}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors
        ${
          isExporting || messages.length === 0
            ? "bg-[#999999] text-[#E5E5E5] cursor-not-allowed"
            : "bg-[#FF5800] text-white hover:bg-[#DC4600] focus:outline-none focus:ring-2 focus:ring-[#FF5800] focus:ring-offset-2"
        }`}
    >
      {isExporting ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#E5E5E5]"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Exporting...
        </>
      ) : (
        <>
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export Document
        </>
      )}
    </button>
  );
};

export default ExportButton;
