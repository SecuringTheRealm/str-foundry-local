"use client";

import { useState, useRef, useEffect } from "react";
import { Message, Agent, WorkflowState } from "@/types/chat";
import MessageItem from "./MessageItem";
import ChatInput from "./ChatInput";
import AgentWorkflow from "./AgentWorkflow";
import ExportButton from "./ExportButton";
import { v4 as uuidv4 } from "uuid";

// Sample agents
const defaultAgents: Agent[] = [
  {
    id: "concierge",
    name: "Concierge",
    description: "Asks you about your topic of interest",
    systemPrompt:
      "You are a helpful Concierge that asks users what they want to learn about.",
    isActive: true,
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Researches topics in depth",
    systemPrompt:
      "You are an expert researcher who provides comprehensive information on topics.",
    isActive: false,
  },
  {
    id: "copywriter",
    name: "Copywriter",
    description: "Creates well-written content",
    systemPrompt:
      "You are a skilled copywriter who transforms research into engaging content.",
    isActive: false,
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description: "Reviews and improves content",
    systemPrompt:
      "You are a detail-oriented reviewer who provides constructive feedback on content.",
    isActive: false,
  },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>(defaultAgents);
  const [isLoading, setIsLoading] = useState(false);
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    stage: "inquiry",
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get the current active agent based on workflow stage
  const getActiveAgentId = (): string => {
    switch (workflowState.stage) {
      case "inquiry":
        return "concierge";
      case "research":
        return "researcher";
      case "writing":
        return "copywriter";
      case "review":
        return "reviewer";
      default:
        return "concierge";
    }
  };

  const activeAgentId = getActiveAgentId();
  const activeAgent =
    agents.find((agent) => agent.id === activeAgentId) || agents[0];

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Initialize the chat with a welcome message from the concierge
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        id: uuidv4(),
        role: "concierge",
        content:
          "Hello! I'm your concierge. What topic would you like me to help you learn about today?",
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [messages.length]);

  // Force the transition to the next agent when the workflow stage changes
  useEffect(() => {
    const handleWorkflowTransition = async () => {
      // Don't show automatic transition message for the initial state
      if (messages.length <= 1) return;

      const lastMessage = messages[messages.length - 1];

      // If the last message was from the user or if we're already showing a transition message, don't add another one
      if (
        lastMessage.role === "user" ||
        lastMessage.content.includes("I'll research") ||
        lastMessage.content.includes("Research complete") ||
        lastMessage.content.includes("Draft complete")
      ) {
        return;
      }

      // Show transition messages between agents
      let transitionMessage: Message | null = null;

      switch (workflowState.stage) {
        case "research":
          // Only add transition if the last message wasn't already from the researcher
          if (lastMessage.role !== "researcher" && workflowState.topic) {
            transitionMessage = {
              id: uuidv4(),
              role: "researcher",
              content: `I'll research "${workflowState.topic}" for you now.`,
              timestamp: new Date(),
              agentId: "researcher",
            };
          }
          break;
        case "writing":
          // Only add transition if the last message wasn't already from the copywriter
          if (
            lastMessage.role !== "copywriter" &&
            workflowState.researchNotes
          ) {
            transitionMessage = {
              id: uuidv4(),
              role: "copywriter",
              content: `Research complete. I'm now drafting content about "${workflowState.topic}".`,
              timestamp: new Date(),
              agentId: "copywriter",
            };
          }
          break;
        case "review":
          // Only add transition if the last message wasn't already from the reviewer
          if (lastMessage.role !== "reviewer" && workflowState.draft) {
            transitionMessage = {
              id: uuidv4(),
              role: "reviewer",
              content: `Draft complete. Now reviewing the content.`,
              timestamp: new Date(),
              agentId: "reviewer",
            };
          }
          break;
        case "complete":
          if (lastMessage.role !== "copywriter" && workflowState.feedback) {
            transitionMessage = {
              id: uuidv4(),
              role: "copywriter",
              content: `Thanks for the feedback! Here's the final revised content: \n\n${
                workflowState.finalContent || workflowState.draft
              }`,
              timestamp: new Date(),
              agentId: "copywriter",
            };
          }
          break;
      }

      if (transitionMessage) {
        setMessages((prev) => [...prev, transitionMessage!]);
      }

      // If we're in the research or writing stage, automatically generate a response
      // from the appropriate agent after a short delay
      if (
        (workflowState.stage === "research" ||
          workflowState.stage === "writing") &&
        transitionMessage
      ) {
        setIsLoading(true);
        setTimeout(async () => {
          try {
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message:
                  workflowState.stage === "research"
                    ? `Please research ${workflowState.topic}`
                    : `Please write content based on these notes: ${workflowState.researchNotes?.substring(
                        0,
                        500
                      )}...`,
                agentId:
                  workflowState.stage === "research"
                    ? "researcher"
                    : "copywriter",
                systemPrompt: agents.find(
                  (a) =>
                    a.id ===
                    (workflowState.stage === "research"
                      ? "researcher"
                      : "copywriter")
                )?.systemPrompt,
                history: messages,
                workflowState,
              }),
            });

            const data = await response.json();

            if (response.ok) {
              const currentAgentRole =
                workflowState.stage === "research"
                  ? "researcher"
                  : ("copywriter" as any);

              const agentMessage: Message = {
                id: uuidv4(),
                role: currentAgentRole,
                content: data.reply,
                timestamp: new Date(),
                agentId:
                  workflowState.stage === "research"
                    ? "researcher"
                    : "copywriter",
              };

              setMessages((prev) => [...prev, agentMessage]);

              // Update workflow state if needed
              if (
                data.updatedState &&
                Object.keys(data.updatedState).length > 0
              ) {
                setWorkflowState((prevState) => ({
                  ...prevState,
                  ...data.updatedState,
                }));
              }
            }
          } catch (error) {
            console.error("Error:", error);
          } finally {
            setIsLoading(false);
          }
        }, 1000);
      }
    };

    handleWorkflowTransition();
  }, [workflowState.stage, agents, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleStageComplete = (newState: Partial<WorkflowState>) => {
    setWorkflowState((prevState) => ({ ...prevState, ...newState }));
  };

  const handleSendMessage = async (content: string) => {
    if (content.trim() === "") return;

    // Add user message
    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          agentId: activeAgentId,
          systemPrompt: activeAgent.systemPrompt,
          history: messages,
          workflowState,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Add the agent's response
        const currentAgentRole = getActiveAgentId() as any; // Cast to Role type

        const agentMessage: Message = {
          id: uuidv4(),
          role: currentAgentRole,
          content: data.reply,
          timestamp: new Date(),
          agentId: activeAgentId,
        };

        setMessages((prev) => [...prev, agentMessage]);

        // Update workflow state if needed
        if (data.updatedState && Object.keys(data.updatedState).length > 0) {
          setWorkflowState((prevState) => ({
            ...prevState,
            ...data.updatedState,
          }));

          // If there's an auto-advance response, add it as well
          if (data.autoAdvance && data.autoAdvance.response) {
            const nextAgentRole = getAgentRoleForStage(data.updatedState.stage);

            const autoMessage: Message = {
              id: uuidv4(),
              role: nextAgentRole,
              content: data.autoAdvance.response,
              timestamp: new Date(),
              agentId: getAgentIdForStage(data.updatedState.stage),
            };

            // Add a slight delay before showing the auto-advance message
            setTimeout(() => {
              setMessages((prev) => [...prev, autoMessage]);

              // Update workflow state with auto-advance updates
              if (data.autoAdvance.updatedState) {
                setWorkflowState((prevState) => ({
                  ...prevState,
                  ...data.autoAdvance.updatedState,
                }));
              }
            }, 1000);
          }
        }
      } else {
        console.error("Error:", data.error);

        const errorMessage: Message = {
          id: uuidv4(),
          role: "agent",
          content: `Sorry, there was an error: ${data.error}`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Error:", error);

      const errorMessage: Message = {
        id: uuidv4(),
        role: "agent",
        content: "Sorry, there was an error processing your request.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to get agent role based on workflow stage
  const getAgentRoleForStage = (
    stage: string
  ): "concierge" | "researcher" | "copywriter" | "reviewer" | "agent" => {
    switch (stage) {
      case "inquiry":
        return "concierge";
      case "research":
        return "researcher";
      case "writing":
        return "copywriter";
      case "review":
        return "reviewer";
      default:
        return "agent";
    }
  };

  // Helper function to get agent ID based on workflow stage
  const getAgentIdForStage = (stage: string): string => {
    switch (stage) {
      case "inquiry":
        return "concierge";
      case "research":
        return "researcher";
      case "writing":
        return "copywriter";
      case "review":
        return "reviewer";
      default:
        return "concierge";
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex flex-col items-center justify-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-[#FF5800] mb-2">
            Foundry Local Document Generation
          </h1>
          <p className="text-[#666666] text-center max-w-2xl">
            Automate document creation with a multi-agent workflow. Simply
            provide a topic and our AI agents will research, write, and refine
            content for you.
          </p>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <AgentWorkflow
            agents={agents}
            workflowState={workflowState}
            onStageComplete={handleStageComplete}
          />
          <div>
            <ExportButton messages={messages} workflowState={workflowState} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mb-6 p-6 bg-white rounded-lg shadow-md border border-[#E5E5E5]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#666666]">
            <p>No messages yet. Start a conversation!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="mb-4">
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </div>
  );
}
