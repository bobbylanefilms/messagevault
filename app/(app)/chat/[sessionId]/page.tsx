// ABOUTME: Chat session placeholder — will be built in F4.
// ABOUTME: Will show a specific AI conversation with streaming responses.

import { Bot } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <EmptyState
      icon={Bot}
      title="Chat Session"
      description={`Your conversation ${sessionId} with the AI will appear here.`}
    />
  );
}
