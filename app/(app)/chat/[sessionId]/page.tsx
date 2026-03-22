// ABOUTME: Individual chat session view — header, message list, and input.
// ABOUTME: Composes ChatSessionHeader + ChatMessageList + ChatInput for the full chat experience.

"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChatSessionHeader } from "@/components/chat/chat-session-header";
import { ChatScopePanel } from "@/components/chat/chat-scope-panel";
import { ChatSessionList } from "@/components/chat/chat-session-list";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useChatStore } from "@/lib/stores/use-chat-store";

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const setActiveSessionId = useChatStore((s) => s.setActiveSessionId);
  const setActiveStreamId = useChatStore((s) => s.setActiveStreamId);
  const setIsStreaming = useChatStore((s) => s.setIsStreaming);
  const setInputText = useChatStore((s) => s.setInputText);

  const session = useQuery(api.chatSessions.get, {
    sessionId: sessionId as Id<"chatSessions">,
  });

  useEffect(() => {
    setActiveSessionId(sessionId);
    return () => setActiveSessionId(null);
  }, [sessionId, setActiveSessionId]);

  useEffect(() => {
    if (session === null) {
      router.push("/chat");
    }
  }, [session, router]);

  function handleStreamStart(streamId: string, _sessionId: string) {
    setActiveStreamId(streamId);
  }

  function handleStreamComplete() {
    setIsStreaming(false);
    setActiveStreamId(null);
  }

  function handleSuggestionClick(text: string) {
    setInputText(text);
    // Small delay to let the input update, then the user can press Enter or it auto-sends
    // Actually, let's just set the text and let the user send it
  }

  if (session === undefined) {
    return (
      <div className="flex h-full">
        <div className="hidden md:flex">
          <ChatSessionList />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex h-full">
      <div className="hidden md:flex">
        <ChatSessionList />
      </div>
      <div className="flex flex-1 flex-col">
        <ChatSessionHeader
          sessionId={session._id}
          title={session.title}
          model={session.model}
          thinkingEnabled={session.thinkingEnabled}
        />
        <ChatScopePanel
          sessionId={session._id}
          contextScope={session.contextScope}
        />
        <ChatMessageList
          sessionId={session._id}
          model={session.model}
          onSuggestionClick={handleSuggestionClick}
        />
        <ChatInput
          sessionId={session._id}
          onStreamStart={handleStreamStart}
        />
      </div>
    </div>
  );
}
