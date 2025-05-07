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
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(
    null
  );

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
  }, [messages, streamingMessage?.content]);

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
            await streamMessage(
              workflowState.stage === "research"
                ? `Please research ${workflowState.topic}`
                : `Please write content based on these notes: ${workflowState.researchNotes?.substring(
                    0,
                    500
                  )}...`,
              workflowState.stage === "research" ? "researcher" : "copywriter"
            );
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
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Function to check if user is scrolled to bottom
  const checkScrollPosition = () => {
    const container = chatContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider "at bottom" if within 100px of the bottom
      const isCurrentlyAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsAtBottom(isCurrentlyAtBottom);
    }
  };

  // Add scroll event monitoring
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      // Check initial scroll position
      checkScrollPosition();

      // Add scroll event listener
      container.addEventListener("scroll", checkScrollPosition);

      return () => {
        container.removeEventListener("scroll", checkScrollPosition);
      };
    }
  }, []);

  // Set up auto-scrolling for thought process streaming
  useEffect(() => {
    if (streamingMessage?.isThinking) {
      scrollToBottom();
    }
  }, [streamingMessage?.thoughtProcess]);

  const handleStageComplete = (newState: Partial<WorkflowState>) => {
    setWorkflowState((prevState) => ({ ...prevState, ...newState }));
  };

  // Function to handle streaming messages
  const streamMessage = async (
    content: string,
    agentId: string = activeAgentId
  ) => {
    if (!content.trim()) return;

    // Create a unique ID for this streaming message
    const messageId = uuidv4();

    // Get the current agent role
    const currentAgentRole = agentId as any;

    // Initialize a streaming message with empty content
    const initialMessage: Message = {
      id: messageId,
      role: currentAgentRole,
      content: "",
      timestamp: new Date(),
      agentId: agentId,
      isThinking: false,
      thoughtProcess: "",
    };

    // Set the streaming message to display it immediately
    setStreamingMessage(initialMessage);

    try {
      // Make the fetch request with streaming enabled
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-use-stream": "true",
        },
        body: JSON.stringify({
          message: content,
          agentId: agentId,
          systemPrompt: agents.find((a) => a.id === agentId)?.systemPrompt,
          history: messages,
          workflowState,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get a reader from the response body
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get reader from response");
      }

      // Read the stream
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let accumulatedThought = "";
      let fullResponse = "";
      let isCurrentlyThinking = false;
      let hasDetectedThinkTokens = false; // Flag to track if this model uses think tokens

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });

        // Check if the chunk contains the done message
        if (chunk.includes('\n{"done":true')) {
          // Extract the full response from the done message
          const doneMatch = chunk.match(
            /\n({"done":true,"fullResponse":".*"})/
          );
          if (doneMatch && doneMatch[1]) {
            try {
              const doneObj = JSON.parse(doneMatch[1].replace(/\\n/g, "\\n"));
              fullResponse = doneObj.fullResponse;
            } catch (e) {
              console.error("Error parsing done message:", e);
            }
          }
          break;
        }

        // Process thinking tokens in the chunk
        let processedChunk = chunk;
        let updatedContent = accumulatedContent;
        let updatedThought = accumulatedThought;
        let updatedIsThinking = isCurrentlyThinking;

        // Handle <think> opening tag
        if (chunk.includes("<think>") && !isCurrentlyThinking) {
          hasDetectedThinkTokens = true; // Set flag indicating this model uses think tokens
          const parts = chunk.split("<think>");
          if (parts.length > 1) {
            // Add everything before the <think> tag to content
            updatedContent += parts[0];
            // Start accumulating thought content
            updatedThought += parts[1];
            updatedIsThinking = true;
          }
        }
        // Handle </think> closing tag
        else if (chunk.includes("</think>") && isCurrentlyThinking) {
          const parts = chunk.split("</think>");
          if (parts.length > 1) {
            // Add everything before the </think> tag to thought
            updatedThought += parts[0];
            // Add everything after the </think> tag to content
            updatedContent += parts[1];
            updatedIsThinking = false;
          }
        }
        // Handle normal content
        else if (isCurrentlyThinking) {
          // Add to thought accumulation
          updatedThought += chunk;
        } else {
          // Add to content accumulation
          updatedContent += chunk;
        }

        // Update accumulated values
        accumulatedContent = updatedContent;
        accumulatedThought = updatedThought;
        isCurrentlyThinking = updatedIsThinking;

        // Update the streaming message with the new content
        setStreamingMessage((prev) =>
          prev
            ? {
                ...prev,
                content: accumulatedContent,
                thoughtProcess: accumulatedThought,
                isThinking: isCurrentlyThinking,
              }
            : null
        );
      }

      // Process the final message to handle any unclosed think tags
      let finalContent = fullResponse || accumulatedContent;
      let finalThought = accumulatedThought;
      let hasThoughtContent = false;

      // Extract <think>...</think> blocks from the final content if they exist
      const thinkPattern = /<think>([\s\S]*?)<\/think>/g;
      const thinkMatches = [...finalContent.matchAll(thinkPattern)];

      if (thinkMatches.length > 0) {
        hasDetectedThinkTokens = true; // Also check the final content for think tokens
        // Collect all thought content
        const thoughts = thinkMatches.map((match) => match[1]).join("\n\n");
        finalThought = thoughts || finalThought;
        hasThoughtContent = thoughts.trim() !== "";

        // Remove all <think>...</think> blocks from the final content
        finalContent = finalContent.replace(thinkPattern, "");
      }

      // Once streaming is complete, create the final message
      const finalMessage: Message = {
        id: messageId,
        role: currentAgentRole,
        content: finalContent.trim(),
        timestamp: new Date(),
        agentId: agentId,
        // Only include thought process if we actually detected think tokens
        thoughtProcess: hasDetectedThinkTokens ? finalThought.trim() : "",
        isThinking: false,
      };

      // Add the final message to the messages array
      setMessages((prev) => [...prev, finalMessage]);

      // Clear the streaming message
      setStreamingMessage(null);

      // Analyze the response to update workflow state if needed
      updateWorkflowState(finalContent, content);
    } catch (error) {
      console.error("Error streaming message:", error);

      // Add error message if streaming fails
      const errorMessage: Message = {
        id: uuidv4(),
        role: "agent",
        content: "Sorry, there was an error processing your request.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      setStreamingMessage(null);
    }
  };

  const updateWorkflowState = (reply: string, userMessage: string) => {
    // Logic to update workflow state based on the reply
    let updatedState: Partial<WorkflowState> = {};

    switch (workflowState.stage) {
      case "inquiry":
        // Check if the message might indicate a topic selection
        if (
          userMessage.length > 10 ||
          reply.toLowerCase().includes("i can research") ||
          reply.toLowerCase().includes("i will research") ||
          reply.toLowerCase().includes("i'll research")
        ) {
          // Try to extract the topic from the reply or use the message as a fallback
          let topic = userMessage;
          const topicMatch = reply.match(/research\s+["'](.+?)["']/i);
          if (topicMatch && topicMatch[1]) {
            topic = topicMatch[1];
          }

          updatedState = {
            topic: topic,
            stage: "research",
          };
        }
        break;

      case "research":
        // Set research notes from the reply for the copywriter
        if (reply.length > 100) {
          // Assume it's substantial research if longer than 100 chars
          updatedState = {
            researchNotes: reply,
            stage: "writing",
          };
        }
        break;

      case "writing":
        // Set draft from the reply for the reviewer
        if (reply.length > 200) {
          // Assume it's a draft if longer than 200 chars
          updatedState = {
            draft: reply,
            stage: "review",
          };
        }
        break;

      case "review":
        // Set feedback and prepare final content
        updatedState = {
          feedback: reply,
          finalContent: workflowState.draft, // Store the draft as final content initially
          stage: "complete",
        };
        break;
    }

    // If we found state updates to apply
    if (Object.keys(updatedState).length > 0) {
      // Update the workflow state
      setWorkflowState((prevState) => ({
        ...prevState,
        ...updatedState,
      }));
    }
  };

  const handleSendMessage = async (content: string) => {
    if (content.trim() === "") return;

    // Add user message to the messages array
    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Use the streaming function to handle the response
      await streamMessage(content);
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

      <div
        className="flex-1 overflow-y-auto mb-6 p-6 bg-white rounded-lg shadow-md border border-[#E5E5E5]"
        ref={chatContainerRef}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#666666]">
            <p>No messages yet. Start a conversation!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}
            {/* Show streaming message if it exists */}
            {streamingMessage && <MessageItem message={streamingMessage} />}
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
