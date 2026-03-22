// ABOUTME: Groups and renders all messages from a single conversation within a calendar day detail.
// ABOUTME: Shows a conversation banner with link to browse view, then iMessage-style message bubbles.

"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Id } from "@/convex/_generated/dataModel";
import { MessageBubble } from "@/components/browse/message-bubble";
import { ReactionChips } from "@/components/browse/reaction-chips";
import { ME_BUBBLE_COLOR } from "@/lib/participant-colors";
import { isWithinMinutes } from "@/lib/date-utils";

type MessageType = "text" | "image" | "video" | "link" | "attachment_missing";

interface Message {
  _id: string;
  content: string;
  senderName: string;
  timestamp: number;
  dateKey: string;
  participantId: string;
  conversationId: string;
  messageType: MessageType;
  attachmentRef?: string;
  hasReactions: boolean;
}

interface Participant {
  _id: string;
  displayName: string;
  isMe: boolean;
  avatarColor: string;
}

interface ConversationGroupProps {
  conversationId: string;
  conversationTitle: string;
  messages: Message[];
  participants: Participant[];
  isGroupChat: boolean;
}

export function ConversationGroup({
  conversationId,
  conversationTitle,
  messages,
  participants,
  isGroupChat,
}: ConversationGroupProps) {
  // Build a map of participantId → participant for fast lookup
  const participantMap = new Map<string, Participant>();
  for (const p of participants) {
    participantMap.set(p._id, p);
  }

  // Collect message IDs that have reactions for batch fetch
  const reactingMessageIds = messages
    .filter((m) => m.hasReactions)
    .map((m) => m._id as Id<"messages">);

  const reactionsResult = useQuery(
    api.reactions.getByMessageIds,
    reactingMessageIds.length > 0 ? { messageIds: reactingMessageIds } : "skip"
  );

  // Build a map of messageId → reactions array
  const reactionsMap = new Map<string, Array<{ reactionType: string; reactorName: string }>>();
  if (reactionsResult) {
    for (const r of reactionsResult) {
      if (!r.messageId) continue;
      const key = r.messageId as string;
      const existing = reactionsMap.get(key) ?? [];
      existing.push({ reactionType: r.reactionType, reactorName: r.reactorName });
      reactionsMap.set(key, existing);
    }
  }

  // Strip "Messages with " prefix from conversation title for compact display
  const displayTitle = conversationTitle.startsWith("Messages with ")
    ? conversationTitle.slice("Messages with ".length)
    : conversationTitle;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Conversation banner */}
      <Link
        href={`/browse/${conversationId}`}
        className="flex items-center gap-2 bg-card/50 hover:bg-card px-4 py-2.5 transition-colors"
      >
        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm truncate">{displayTitle}</span>
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {messages.length} {messages.length === 1 ? "message" : "messages"}
        </span>
      </Link>

      {/* Message list */}
      <div className="px-4 pb-4">
        {messages.map((msg, index) => {
          const participant = participantMap.get(msg.participantId);
          const isMe = participant?.isMe ?? false;
          const avatarColor = isMe
            ? ME_BUBBLE_COLOR
            : (participant?.avatarColor ?? "oklch(0.25 0.01 260)");

          const prevMsg = index > 0 ? messages[index - 1] : null;
          const isContinuation =
            prevMsg !== null &&
            prevMsg !== undefined &&
            prevMsg.participantId === msg.participantId &&
            isWithinMinutes(prevMsg.timestamp, msg.timestamp, 2);

          const msgReactions = reactionsMap.get(msg._id);

          return (
            <MessageBubble
              key={msg._id}
              content={msg.content}
              senderName={msg.senderName}
              timestamp={msg.timestamp}
              isMe={isMe}
              isGroupChat={isGroupChat}
              messageType={msg.messageType}
              attachmentRef={msg.attachmentRef}
              avatarColor={avatarColor}
              isContinuation={isContinuation}
              reactions={
                msgReactions && msgReactions.length > 0 ? (
                  <ReactionChips
                    reactions={
                      msgReactions as Array<{ reactionType: "liked" | "loved" | "laughed" | "disliked" | "emphasized" | "questioned"; reactorName: string }>
                    }
                  />
                ) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
