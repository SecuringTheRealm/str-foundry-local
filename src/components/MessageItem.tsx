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
          bgColor: "bg-gradient-to-r from-[#FF5800] to-[#FFB314]",
          textColor: "text-white",
          timeColor: "text-white text-opacity-80",
        };
      case "researcher":
        return {
          name: "Researcher",
          bgColor: "bg-gradient-to-r from-[#FF5800] to-[#890078]",
          textColor: "text-white",
          timeColor: "text-white text-opacity-80",
        };
      case "copywriter":
        return {
          name: "Copywriter",
          bgColor: "bg-gradient-to-r from-[#FF5800] to-[#CE0569]",
          textColor: "text-white",
          timeColor: "text-white text-opacity-80",
        };
      case "reviewer":
        return {
          name: "Reviewer",
          bgColor: "bg-gradient-to-r from-[#FF5800] to-[#C80000]",
          textColor: "text-white",
          timeColor: "text-white text-opacity-80",
        };
      case "agent":
      default:
        return {
          name: "Agent",
          bgColor: "bg-white border border-[#E5E5E5]",
          textColor: "text-[#333333]",
          timeColor: "text-[#666666]",
        };
    }
  };

  const agentInfo = isUser ? null : getAgentInfo(role);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] ${
          isUser ? "bg-[#FF5800]" : agentInfo?.bgColor
        } rounded-lg p-3 shadow`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className={`text-sm font-semibold ${
              isUser ? "text-white" : agentInfo?.textColor
            }`}
          >
            {isUser ? "You" : agentInfo?.name}
          </div>
          <div
            className={`text-xs ${
              isUser ? "text-white text-opacity-80" : agentInfo?.timeColor
            }`}
          >
            {time}
          </div>
        </div>

        <div
          className={`prose prose-sm ${
            isUser ? "prose-invert" : ""
          } max-w-none`}
        >
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
