'use client';

import { Message, Role } from '@/types/chat';
import ReactMarkdown from 'react-markdown';

interface MessageItemProps {
  message: Message;
}

const MessageItem = ({ message }: MessageItemProps) => {
  const { role, content, timestamp } = message;
  const isUser = role === 'user';
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Get agent display name and color based on role
  const getAgentInfo = (role: Role) => {
    switch (role) {
      case 'concierge':
        return { name: 'Concierge', bgColor: 'bg-purple-600', textColor: 'text-purple-100', timeColor: 'text-purple-200' };
      case 'researcher':
        return { name: 'Researcher', bgColor: 'bg-green-600', textColor: 'text-green-100', timeColor: 'text-green-200' };
      case 'copywriter':
        return { name: 'Copywriter', bgColor: 'bg-amber-600', textColor: 'text-amber-100', timeColor: 'text-amber-200' };
      case 'reviewer':
        return { name: 'Reviewer', bgColor: 'bg-rose-600', textColor: 'text-rose-100', timeColor: 'text-rose-200' };
      case 'agent':
      default:
        return { name: 'Agent', bgColor: 'bg-white border border-gray-200', textColor: 'text-gray-800', timeColor: 'text-gray-500' };
    }
  };
  
  const agentInfo = isUser ? null : getAgentInfo(role);
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${
        isUser 
          ? 'bg-blue-600 text-white' 
          : agentInfo?.bgColor
      } rounded-lg p-3 shadow`}>
        <div className="flex items-center gap-2 mb-1">
          <div className={`text-sm font-semibold ${
            isUser 
              ? 'text-blue-100' 
              : agentInfo?.textColor
          }`}>
            {isUser ? 'You' : agentInfo?.name}
          </div>
          <div className={`text-xs ${
            isUser 
              ? 'text-blue-200' 
              : agentInfo?.timeColor
          }`}>
            {time}
          </div>
        </div>
        
        <div className={`prose prose-sm ${isUser ? 'prose-invert' : ''} max-w-none`}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default MessageItem;