// ABOUTME: Search result card — shows a matched message with surrounding context.
// ABOUTME: Match terms are highlighted, context messages are dimmed, card is clickable.

"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/date-utils";
import { useBrowseStore } from "@/lib/stores/use-browse-store";
import { MapPin } from "lucide-react";

interface ContextMessage {
  _id: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface SearchResultCardProps {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  senderName: string;
  content: string;
  timestamp: number;
  dateKey: string;
  isMe: boolean;
  avatarColor: string;
  searchQuery: string;
  contextBefore: ContextMessage[];
  contextAfter: ContextMessage[];
}

/**
 * Highlight search terms in message content.
 * Splits on whitespace to get individual terms, wraps matches in <mark>.
 */
function HighlightedContent({
  content,
  searchQuery,
}: {
  content: string;
  searchQuery: string;
}) {
  if (!searchQuery.trim()) return <>{content}</>;

  const terms = searchQuery
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (terms.length === 0) return <>{content}</>;

  const regex = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = content.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = regex.test(part);
        regex.lastIndex = 0; // Reset stateful regex
        return isMatch ? (
          <mark
            key={i}
            className="rounded-sm bg-primary/30 px-0.5 text-inherit"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

export function SearchResultCard({
  messageId,
  conversationId,
  conversationTitle,
  senderName,
  content,
  timestamp,
  dateKey,
  isMe,
  avatarColor,
  searchQuery,
  contextBefore,
  contextAfter,
}: SearchResultCardProps) {
  const router = useRouter();
  const setHighlightedMessageId = useBrowseStore((s) => s.setHighlightedMessageId);

  function handleClick() {
    setHighlightedMessageId(messageId);
    router.push(`/browse/${conversationId}`);
  }

  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const bubbleColor = isMe ? "var(--color-bubble-me)" : avatarColor;

  return (
    <button
      onClick={handleClick}
      className="w-full text-left rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Card header: conversation name + date */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate font-medium">
          {conversationTitle}
        </span>
        <span className="shrink-0">&middot;</span>
        <span className="shrink-0">{dateStr}</span>
      </div>

      {/* Context before (dimmed) */}
      {contextBefore.map((ctx) => (
        <div
          key={ctx._id}
          className="mb-1 flex flex-col opacity-40"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {ctx.senderName}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatMessageTime(ctx.timestamp)}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
            {ctx.content}
          </p>
        </div>
      ))}

      {/* Matched message (full opacity, highlighted) */}
      <div
        className={cn(
          "my-1 flex flex-col",
          isMe ? "items-end" : "items-start"
        )}
      >
        <div className="flex items-baseline gap-2 mb-0.5">
          <span
            className="text-[11px] font-medium"
            style={{ color: isMe ? "var(--color-primary)" : avatarColor }}
          >
            {senderName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatMessageTime(timestamp)}
          </span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed text-white",
            isMe ? "max-w-[80%] rounded-br-lg" : "max-w-[85%] rounded-bl-lg"
          )}
          style={{ backgroundColor: bubbleColor }}
        >
          <p className="whitespace-pre-wrap break-words">
            <HighlightedContent content={content} searchQuery={searchQuery} />
          </p>
        </div>
      </div>

      {/* Context after (dimmed) */}
      {contextAfter.map((ctx) => (
        <div
          key={ctx._id}
          className="mt-1 flex flex-col opacity-40"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {ctx.senderName}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatMessageTime(ctx.timestamp)}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
            {ctx.content}
          </p>
        </div>
      ))}
    </button>
  );
}
