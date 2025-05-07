"use client";

import { Message, Role } from "@/types/chat";
import ReactMarkdown from "react-markdown";
import { useState, useEffect } from "react";

interface MessageItemProps {
  message: Message;
}

const MessageItem = ({ message }: MessageItemProps) => {
  const { role, content, timestamp, thoughtProcess, isThinking } = message;
  // Initial state will be expanded when thinking, but collapsed when complete
  const [isThoughtExpanded, setIsThoughtExpanded] = useState(isThinking);
  const isUser = role === "user";
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Update expanded state when thinking status changes
  useEffect(() => {
    setIsThoughtExpanded(isThinking);
  }, [isThinking]);

  // Get agent display name and color based on role
  const getAgentInfo = (role: Role) => {
    switch (role) {
      case "concierge":
        return {
          name: "Concierge",
          accentColor: "bg-gradient-to-r from-[#FF5800] to-[#FFB314]",
          borderColor: "border-[#FF5800]",
        };
      case "researcher":
        return {
          name: "Researcher",
          accentColor: "bg-gradient-to-r from-[#FF5800] to-[#890078]",
          borderColor: "border-[#FF5800]",
        };
      case "copywriter":
        return {
          name: "Copywriter",
          accentColor: "bg-gradient-to-r from-[#FF5800] to-[#CE0569]",
          borderColor: "border-[#FF5800]",
        };
      case "reviewer":
        return {
          name: "Reviewer",
          accentColor: "bg-gradient-to-r from-[#FF5800] to-[#C80000]",
          borderColor: "border-[#FF5800]",
        };
      case "agent":
      default:
        return {
          name: "Agent",
          accentColor: "bg-[#E5E5E5]",
          borderColor: "border-[#E5E5E5]",
        };
    }
  };

  const agentInfo = isUser ? null : getAgentInfo(role);

  // Handle the toggle of thought process display
  const toggleThoughtExpand = () => {
    setIsThoughtExpanded(!isThoughtExpanded);
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] bg-white rounded-lg shadow overflow-hidden border ${
          isUser ? "border-[#FF5800]" : agentInfo?.borderColor
        }`}
      >
        {/* Gradient accent bar at the top */}
        <div
          className={`h-2 w-full ${
            isUser ? "bg-[#FF5800]" : agentInfo?.accentColor
          }`}
        ></div>

        <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <div
              className={`text-sm font-semibold ${
                isUser ? "text-[#FF5800]" : "text-[#333333]"
              }`}
            >
              {isUser ? "You" : agentInfo?.name}
            </div>
            <div className="text-xs text-[#666666]">{time}</div>
          </div>

          {/* Display thinking process live as it happens - only if we have actual thought content */}
          {isThinking && thoughtProcess && thoughtProcess.trim() !== "" && (
            <div className="mb-3">
              <div className="bg-[#F7F7F7] rounded p-2 mb-2 flex justify-between items-center">
                <div className="text-[#666666] font-medium flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1 animate-pulse"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="#FF5800"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  Thinking...
                </div>
              </div>
              <div className="p-3 bg-[#F7F7F7] rounded border border-[#E5E5E5] prose prose-sm max-w-none text-[#666666] italic">
                <ReactMarkdown>{thoughtProcess}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Display completed thought process with toggle option - only if we have actual thought content */}
          {thoughtProcess && thoughtProcess.trim() !== "" && !isThinking && (
            <div className="mb-3">
              <div
                className="bg-[#F7F7F7] rounded p-2 cursor-pointer hover:bg-[#E5E5E5] flex justify-between items-center"
                onClick={toggleThoughtExpand}
              >
                <div className="text-[#666666] font-medium flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`h-4 w-4 mr-1 transform transition-transform ${
                      isThoughtExpanded ? "rotate-90" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="#666666"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  Thought process
                </div>
                <div className="text-xs text-[#666666]">
                  {isThoughtExpanded ? "Click to collapse" : "Click to expand"}
                </div>
              </div>

              {isThoughtExpanded && (
                <div className="mt-2 p-3 bg-[#F7F7F7] rounded border border-[#E5E5E5] prose prose-sm max-w-none text-[#666666] italic">
                  <ReactMarkdown>{thoughtProcess}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Display main message content */}
          <div className="prose prose-sm max-w-none text-[#333333]">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
