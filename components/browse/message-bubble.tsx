// ABOUTME: iMessage-style message bubble — right-aligned blue (me), left-aligned colored (others).
// ABOUTME: Handles compact grouping for consecutive same-sender messages within 2 minutes.

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/date-utils";
import { MessageTypeIcon } from "@/components/shared/message-type-icon";

type MessageType = "text" | "image" | "video" | "link" | "attachment_missing";

interface MessageBubbleProps {
  content: string;
  senderName: string;
  timestamp: number;
  isMe: boolean;
  isGroupChat: boolean;
  messageType: MessageType;
  attachmentRef?: string;
  avatarColor: string;
  /** True if this message continues a group from the same sender (compact mode) */
  isContinuation: boolean;
  /** Slot for reaction chips (rendered by parent, passed in for layout) */
  reactions?: React.ReactNode;
}

export function MessageBubble({
  content,
  senderName,
  timestamp,
  isMe,
  isGroupChat,
  messageType,
  attachmentRef,
  avatarColor,
  isContinuation,
  reactions,
}: MessageBubbleProps) {
  const [showTimestamp, setShowTimestamp] = useState(false);

  const bubbleColor = isMe
    ? "var(--color-bubble-me)"
    : isGroupChat
      ? avatarColor
      : "var(--color-bubble-other)";

  const isAttachment = messageType !== "text";

  return (
    <div
      className={cn(
        "flex flex-col",
        isMe ? "items-end" : "items-start",
        isContinuation ? "mt-0.5" : "mt-3"
      )}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      {/* Sender name — shown for non-me messages in group chats, only on first in group */}
      {!isMe && isGroupChat && !isContinuation && (
        <span
          className="mb-1 ml-1 text-[11px] font-medium"
          style={{ color: avatarColor }}
        >
          {senderName}
        </span>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "relative rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed",
          isMe ? "max-w-[65%]" : "max-w-[70%]",
          // Soften corners for continuation bubbles
          isMe && isContinuation && "rounded-tr-lg",
          isMe && !isContinuation && "rounded-br-lg",
          !isMe && isContinuation && "rounded-tl-lg",
          !isMe && !isContinuation && "rounded-bl-lg"
        )}
        style={{
          backgroundColor: bubbleColor,
          color: isMe ? "white" : isGroupChat ? "white" : "var(--color-foreground)",
        }}
      >
        {/* Attachment indicator */}
        {isAttachment && (
          <div className="mb-1 flex items-center gap-1.5">
            <MessageTypeIcon type={messageType} />
            {attachmentRef && (
              <span className="text-[12px] opacity-70 truncate max-w-[200px]">
                {attachmentRef}
              </span>
            )}
          </div>
        )}

        {/* Message content */}
        <p className="whitespace-pre-wrap break-words">{content}</p>
      </div>

      {/* Hover timestamp */}
      {showTimestamp && (
        <span
          className={cn(
            "mt-0.5 text-[10px] text-muted-foreground transition-opacity",
            isMe ? "mr-1" : "ml-1"
          )}
        >
          {formatMessageTime(timestamp)}
        </span>
      )}

      {/* Reaction chips slot */}
      {reactions && (
        <div className={cn("mt-0.5", isMe ? "mr-1" : "ml-1")}>
          {reactions}
        </div>
      )}
    </div>
  );
}
