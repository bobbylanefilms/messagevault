// ABOUTME: AI Chat placeholder — will be built in F4.
// ABOUTME: Will provide RAG-powered chat over imported message history.

import { Bot } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function ChatPage() {
  return (
    <EmptyState
      icon={Bot}
      title="AI Chat"
      description="Chat with your message archive using AI. Import conversations to get started."
      action={{ label: "Import conversations", href: "/import" }}
    />
  );
}
