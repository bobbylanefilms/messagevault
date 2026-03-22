// ABOUTME: Chat input — textarea with send button, Enter to send, Shift+Enter for newline.
// ABOUTME: Integrates with Zustand store for input state and streaming status.

"use client";

import { useRef, useCallback, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/lib/stores/use-chat-store";

interface ChatInputProps {
  sessionId: Id<"chatSessions">;
  onStreamStart?: (streamId: string, sessionId: string) => void;
}

export function ChatInput({ sessionId, onStreamStart }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputText = useChatStore((s) => s.inputText);
  const setInputText = useChatStore((s) => s.setInputText);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);
  const initiateChat = useAction(api.chat.initiateChat);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = Math.min(scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [inputText, adjustHeight]);

  const canSend = inputText.trim().length > 0 && !isStreaming;

  async function handleSend() {
    if (!canSend) return;
    const message = inputText.trim();
    setInputText("");
    setIsStreaming(true);

    try {
      const result = await initiateChat({
        sessionId,
        userMessage: message,
      });
      onStreamStart?.(result.streamId, result.sessionId);
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? "Waiting for response..." : "Ask about your messages..."}
            disabled={isStreaming}
            rows={1}
            className="w-full resize-none bg-transparent text-[14px] outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-full p-2 transition-colors"
          onClick={handleSend}
          disabled={!canSend}
        >
          <SendHorizontal
            className={cn(
              "h-5 w-5",
              canSend ? "text-primary" : "text-muted-foreground opacity-50"
            )}
          />
        </Button>
      </div>
    </div>
  );
}
