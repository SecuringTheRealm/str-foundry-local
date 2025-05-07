"use client";

import { Message, Role } from "@/types/chat";
import ReactMarkdown from "react-markdown";

interface MessageItemProps {
  message: Message;
}

const MessageItem = ({ message }: MessageItemProps) => {
  const { role, content, timestamp } = message;
  const isUser = role === "user";
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

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

          <div className="prose prose-sm max-w-none text-[#333333]">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
