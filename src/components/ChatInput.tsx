"use client";

import { useState, FormEvent, KeyboardEvent, useRef } from "react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const ChatInput = ({ onSendMessage, isLoading }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSendMessage(message);
      setMessage("");
      inputRef.current?.focus(); // Retain focus on the input field
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="relative" onSubmit={handleSubmit}>
      <textarea
        ref={inputRef} // Attach the ref to the textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your message here..."
        className="w-full p-4 pr-16 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#FF5800] focus:border-transparent resize-none shadow-sm bg-white text-[#333333]"
        rows={3}
        disabled={isLoading}
      />
      <button
        type="submit"
        className={`absolute right-3 bottom-3 p-2 rounded-lg ${
          isLoading || !message.trim()
            ? "bg-[#999999] cursor-not-allowed"
            : "bg-[#FF5800] hover:bg-[#DC4600] text-white"
        }`}
        disabled={isLoading || !message.trim()}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-6 w-6 text-[#E5E5E5]"
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
        ) : (
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        )}
      </button>
    </form>
  );
};

export default ChatInput;
