// ABOUTME: Conversation thread placeholder — will be built in C2.
// ABOUTME: Will show iMessage-style message bubbles with virtualized scrolling.

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return (
    <EmptyState
      icon={MessageSquare}
      title="Conversation"
      description={`Message thread view for ${conversationId} will appear here.`}
    />
  );
}
