// ABOUTME: Conversation thread page — loads conversation metadata and renders message thread.
// ABOUTME: Uses Convex reactive queries for real-time data with the virtualized thread view.

"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MessageThread } from "@/components/browse/message-thread";
import { ThreadHeader } from "@/components/browse/thread-header";
import { MessageThreadSkeleton } from "@/components/shared/skeletons";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const conversation = useQuery(api.conversations.get, {
    conversationId: conversationId as Id<"conversations">,
  });

  // Loading
  if (conversation === undefined) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-6 py-3">
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-1.5 h-3 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex-1 p-4">
          <MessageThreadSkeleton />
        </div>
      </div>
    );
  }

  // Not found
  if (conversation === null) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Conversation Not Found"
        description="This conversation doesn't exist or you don't have access to it."
        action={{ label: "Browse conversations", href: "/browse" }}
      />
    );
  }

  const validParticipants = conversation.participants.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );
  const participantNames = validParticipants
    .filter((p) => !p.isMe)
    .map((p) => p.displayName);

  return (
    <div className="flex h-full flex-col">
      <ThreadHeader
        title={conversation.title}
        participantNames={participantNames}
        isGroupChat={conversation.isGroupChat}
        messageCount={conversation.messageCount}
        dateRange={conversation.dateRange}
      />
      <MessageThread
        conversationId={conversation._id}
        isGroupChat={conversation.isGroupChat}
        participants={validParticipants.map((p) => ({
          _id: p._id,
          displayName: p.displayName,
          isMe: p.isMe,
          avatarColor: p.avatarColor,
        }))}
        dateRange={conversation.dateRange}
      />
    </div>
  );
}
