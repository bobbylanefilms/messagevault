// ABOUTME: Calendar day detail page — shows all messages from a specific day grouped by conversation.
// ABOUTME: Client component with live Convex queries; unwraps params via React use().

"use client";

import { use, useMemo } from "react";
import { useQuery } from "convex/react";
import { Calendar } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DayNavigation } from "@/components/calendar/day-navigation";
import { ConversationGroup } from "@/components/calendar/conversation-group";
import { formatDayHeader } from "@/lib/date-utils";

export default function CalendarDayPage({
  params,
}: {
  params: Promise<{ dateKey: string }>;
}) {
  const { dateKey } = use(params);

  const messages = useQuery(api.messages.listByDateKey, { dateKey });
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  // Loading state
  if (messages === undefined || conversations === undefined || participants === undefined) {
    return (
      <div>
        <PageHeader title={formatDayHeader(dateKey)} />
        <div className="space-y-6 p-6">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // Build conversation map for O(1) lookup
  const conversationMap = new Map(conversations.map((c) => [c._id, c]));

  // Build participant list with only the fields ConversationGroup needs
  const participantList = participants.map((p) => ({
    _id: p._id as string,
    displayName: p.displayName,
    isMe: p.isMe,
    avatarColor: p.avatarColor,
  }));

  // Empty state
  if (messages.length === 0) {
    return (
      <div>
        <PageHeader
          title={formatDayHeader(dateKey)}
          description="No messages found for this day."
        >
          <DayNavigation dateKey={dateKey} />
        </PageHeader>
        <EmptyState
          icon={Calendar}
          title="No messages"
          description="There are no messages archived for this day."
        />
      </div>
    );
  }

  // Group messages by conversationId, preserving insertion order
  const groupedMap = new Map<string, typeof messages>();
  for (const msg of messages) {
    const convId = msg.conversationId as string;
    const existing = groupedMap.get(convId) ?? [];
    existing.push(msg);
    groupedMap.set(convId, existing);
  }
  const conversationGroups = Array.from(groupedMap.entries());

  const uniqueConversationCount = conversationGroups.length;
  const description = `${messages.length} ${messages.length === 1 ? "message" : "messages"} across ${uniqueConversationCount} ${uniqueConversationCount === 1 ? "conversation" : "conversations"}`;

  return (
    <div>
      <PageHeader
        title={formatDayHeader(dateKey)}
        description={description}
      >
        <DayNavigation dateKey={dateKey} />
      </PageHeader>

      <div className="space-y-6 p-6">
        {conversationGroups.map(([convId, convMessages]) => {
          const conversation = conversationMap.get(convId as any);
          const title = conversation?.title ?? "Unknown Conversation";
          const isGroupChat = (conversation?.participantIds?.length ?? 0) > 2;

          return (
            <ConversationGroup
              key={convId}
              conversationId={convId}
              conversationTitle={title}
              messages={convMessages.map((m) => ({
                _id: m._id as string,
                content: m.content,
                senderName: m.senderName,
                timestamp: m.timestamp,
                dateKey: m.dateKey,
                participantId: m.participantId as string,
                conversationId: m.conversationId as string,
                messageType: m.messageType as "text" | "image" | "video" | "link" | "attachment_missing",
                attachmentRef: m.attachmentRef,
                hasReactions: m.hasReactions,
              }))}
              participants={participantList}
              isGroupChat={isGroupChat}
            />
          );
        })}
      </div>
    </div>
  );
}
