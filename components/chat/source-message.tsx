// ABOUTME: Mini message bubble for source attribution — compact version of browse message bubble.
// ABOUTME: Shows sender, time, and content preview with click-through to browse view.

"use client";

import { useRouter } from "next/navigation";
import { useBrowseStore } from "@/lib/stores/use-browse-store";

interface SourceMessageProps {
  messageId: string;
  conversationId: string;
  senderName: string;
  content: string;
  timestamp: number;
  avatarColor: string;
}

export function SourceMessage({
  messageId,
  conversationId,
  senderName,
  content,
  timestamp,
  avatarColor,
}: SourceMessageProps) {
  const router = useRouter();
  const setHighlightedMessageId = useBrowseStore((s) => s.setHighlightedMessageId);

  function handleClick() {
    setHighlightedMessageId(messageId);
    router.push(`/browse/${conversationId}`);
  }

  const time = new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <button
      onClick={handleClick}
      className="w-full cursor-pointer rounded-lg border-l-2 p-2 text-left transition-colors hover:bg-accent/50"
      style={{ borderLeftColor: avatarColor }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-medium"
          style={{ color: avatarColor }}
        >
          {senderName}
        </span>
        <span className="text-[11px] text-muted-foreground">{time}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-foreground/80">
        {content}
      </p>
    </button>
  );
}
