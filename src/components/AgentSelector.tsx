"use client";

import { Agent } from "@/types/chat";

interface AgentSelectorProps {
  agents: Agent[];
  onAgentChange: (agentId: string) => void;
}

const AgentSelector = ({ agents, onAgentChange }: AgentSelectorProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onAgentChange(e.target.value);
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="agent-select"
        className="text-sm font-medium text-[#4C4C4C]"
      >
        Select an Agent:
      </label>
      <div className="relative">
        <select
          id="agent-select"
          className="block w-full p-3 border border-[#E5E5E5] bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF5800] focus:border-[#FF5800] text-[#333333]"
          onChange={handleChange}
          value={agents.find((agent) => agent.isActive)?.id || agents[0].id}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} - {agent.description}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
          <svg
            className="w-5 h-5 text-[#FF5800]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default AgentSelector;
