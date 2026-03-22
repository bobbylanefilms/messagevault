// ABOUTME: AI Chat page — two-panel layout with session list and active chat area.
// ABOUTME: Entry point for AI chat feature, handles session creation and routing.

"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatSessionList } from "@/components/chat/chat-session-list";

export default function ChatPage() {
  const router = useRouter();
  const createSession = useMutation(api.chatSessions.create);

  async function handleNewChat() {
    const sessionId = await createSession({});
    router.push(`/chat/${sessionId}`);
  }

  return (
    <div className="flex h-full">
      {/* Session list — hidden on mobile */}
      <div className="hidden md:flex">
        <ChatSessionList />
      </div>

      {/* Empty state */}
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">
          Start a conversation
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Select a chat from the sidebar or create a new one
        </p>
        <Button variant="outline" size="sm" className="mt-5 gap-2" onClick={handleNewChat}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>
    </div>
  );
}
