// ABOUTME: Chat message list — scrollable container for user/assistant message history.
// ABOUTME: Handles auto-scroll, streaming message display, and empty state with suggestions.

"use client";

import { useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChatMessage } from "@/components/chat/chat-message";
import { ChatStreamingMessage } from "@/components/chat/chat-streaming-message";
import { ChatSuggestions } from "@/components/chat/chat-suggestions";
import { ChatSources } from "@/components/chat/chat-sources";
import { useChatStore } from "@/lib/stores/use-chat-store";

interface ChatMessageListProps {
  sessionId: Id<"chatSessions">;
  model: string;
  onSuggestionClick: (text: string) => void;
}

export function ChatMessageList({
  sessionId,
  model,
  onSuggestionClick,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = useQuery(api.chatMessages.listBySession, { sessionId });
  const activeStreamId = useChatStore((s) => s.activeStreamId);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const isNearBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages?.length, isNearBottom]);

  // Also auto-scroll when streaming starts
  useEffect(() => {
    if (isStreaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isStreaming]);

  if (messages === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Empty state with suggestions
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <ChatSuggestions onSuggestionClick={onSuggestionClick} />
      </div>
    );
  }

  // Find the streaming message (latest assistant with empty content and a streamId)
  const streamingMessage = messages.find(
    (m: any) => m.role === "assistant" && m.streamId && m.content === ""
  );

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-1">
        {messages.map((msg: any, i: number) => {
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const spacing = prevMsg && prevMsg.role !== msg.role ? "mt-6" : "mt-2";

          // If this is the streaming assistant message, show streaming component
          if (
            msg.role === "assistant" &&
            msg.streamId &&
            msg.content === "" &&
            activeStreamId === msg.streamId
          ) {
            return (
              <div key={msg._id} className={i > 0 ? spacing : ""}>
                <ChatStreamingMessage
                  streamId={msg.streamId}
                  driven={true}
                  model={msg.model ?? model}
                  sessionId={sessionId}
                />
              </div>
            );
          }

          // Regular message
          return (
            <div key={msg._id} className={i > 0 ? spacing : ""}>
              <ChatMessage
                role={msg.role as "user" | "assistant"}
                content={msg.content}
                model={msg.model}
                thinkingContent={msg.thinkingContent}
                timestamp={msg._creationTime}
                retrievedMessageIds={msg.retrievedMessageIds?.map(String)}
                retrievalStrategy={msg.retrievalStrategy}
                sourcesSlot={
                  msg.role === "assistant" &&
                  msg.retrievedMessageIds &&
                  msg.retrievedMessageIds.length > 0 ? (
                    <ChatSources
                      retrievedMessageIds={msg.retrievedMessageIds.map(String)}
                      retrievalStrategy={msg.retrievalStrategy ?? "hybrid"}
                    />
                  ) : undefined
                }
              />
            </div>
          );
        })}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
