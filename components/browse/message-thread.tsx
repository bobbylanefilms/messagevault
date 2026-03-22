// ABOUTME: Virtualized message thread — the core browse view rendering engine.
// ABOUTME: Uses @tanstack/react-virtual for smooth scrolling through 14K+ message conversations.

"use client";

import { useRef, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MessageBubble } from "@/components/browse/message-bubble";
import { DayDivider } from "@/components/browse/day-divider";
import { ReactionChips } from "@/components/browse/reaction-chips";
import { ThreadToolbar } from "@/components/browse/thread-toolbar";
import { MessageThreadSkeleton } from "@/components/shared/skeletons";
import { isWithinMinutes } from "@/lib/date-utils";
import { useBrowseStore } from "@/lib/stores/use-browse-store";
import { ME_BUBBLE_COLOR } from "@/lib/participant-colors";

interface Participant {
  _id: string;
  displayName: string;
  isMe: boolean;
  avatarColor: string;
}

interface MessageThreadProps {
  conversationId: Id<"conversations">;
  isGroupChat: boolean;
  participants: Participant[];
  dateRange: { start: number; end: number };
}

/**
 * A "row" in the virtualized list — either a day divider or a message.
 */
type ThreadRow =
  | { type: "divider"; dateKey: string }
  | {
      type: "message";
      message: {
        _id: string;
        content: string;
        senderName: string;
        timestamp: number;
        dateKey: string;
        participantId: string;
        messageType: "text" | "image" | "video" | "link" | "attachment_missing";
        attachmentRef?: string;
        hasReactions: boolean;
      };
      isMe: boolean;
      avatarColor: string;
      isContinuation: boolean;
    };

const PAGE_SIZE = 200;

export function MessageThread({
  conversationId,
  isGroupChat,
  participants,
  dateRange,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    hasScrolledToBottom,
    setHasScrolledToBottom,
    resetBrowseState,
    selectedParticipantIds,
    scrollToDateKey,
    setScrollToDateKey,
  } = useBrowseStore();

  // Reset browse state when conversation changes
  useEffect(() => {
    resetBrowseState();
  }, [conversationId, resetBrowseState]);

  // Load all messages via pagination
  const { results: messages, status, loadMore } = usePaginatedQuery(
    api.messages.listByConversation,
    { conversationId },
    { initialNumItems: PAGE_SIZE }
  );

  // Auto-load remaining pages
  useEffect(() => {
    if (status === "CanLoadMore") {
      loadMore(PAGE_SIZE);
    }
  }, [status, loadMore]);

  // Build participant lookup
  const participantMap = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const p of participants) {
      map.set(p._id, p);
    }
    return map;
  }, [participants]);

  // Build FULL row list (unfiltered): insert day dividers between date boundaries
  const allRows: ThreadRow[] = useMemo(() => {
    if (messages.length === 0) return [];

    const result: ThreadRow[] = [];
    let lastDateKey: string | null = null;
    let lastParticipantId: string | null = null;
    let lastTimestamp: number | null = null;

    for (const msg of messages) {
      // Insert day divider if date changed
      if (msg.dateKey !== lastDateKey) {
        result.push({ type: "divider", dateKey: msg.dateKey });
        lastParticipantId = null;
        lastTimestamp = null;
      }

      const participant = participantMap.get(msg.participantId);
      const isMe = participant?.isMe ?? false;
      const avatarColor = isMe
        ? ME_BUBBLE_COLOR
        : participant?.avatarColor ?? "var(--color-bubble-other)";

      // Continuation: same sender within 2 minutes
      const isContinuation =
        lastParticipantId === msg.participantId &&
        lastTimestamp !== null &&
        isWithinMinutes(lastTimestamp, msg.timestamp, 2);

      result.push({
        type: "message",
        message: msg,
        isMe,
        avatarColor,
        isContinuation,
      });

      lastDateKey = msg.dateKey;
      lastParticipantId = msg.participantId;
      lastTimestamp = msg.timestamp;
    }

    return result;
  }, [messages, participantMap]);

  // Collect active date keys from all messages (for DateJumper)
  const activeDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const msg of messages) {
      keys.add(msg.dateKey);
    }
    return keys;
  }, [messages]);

  // Apply participant filter (C4)
  const isFiltered = selectedParticipantIds.length > 0;

  const rows: ThreadRow[] = useMemo(() => {
    if (!isFiltered) return allRows;

    const filtered: ThreadRow[] = [];
    let lastDateKey: string | null = null;
    let lastParticipantId: string | null = null;
    let lastTimestamp: number | null = null;

    for (const row of allRows) {
      if (row.type === "divider") {
        // Skip dividers; we'll re-insert them based on filtered messages
        continue;
      }

      // Filter by selected participants
      if (!selectedParticipantIds.includes(row.message.participantId)) {
        continue;
      }

      // Re-insert day divider if date changed
      if (row.message.dateKey !== lastDateKey) {
        filtered.push({ type: "divider", dateKey: row.message.dateKey });
        lastParticipantId = null;
        lastTimestamp = null;
      }

      // Recompute continuation (since filtering changes adjacency)
      const isContinuation =
        lastParticipantId === row.message.participantId &&
        lastTimestamp !== null &&
        isWithinMinutes(lastTimestamp, row.message.timestamp, 2);

      filtered.push({
        ...row,
        isContinuation,
      });

      lastDateKey = row.message.dateKey;
      lastParticipantId = row.message.participantId;
      lastTimestamp = row.message.timestamp;
    }

    return filtered;
  }, [allRows, isFiltered, selectedParticipantIds]);

  // Count filtered messages (excluding dividers)
  const filteredMessageCount = useMemo(() => {
    return rows.filter((r) => r.type === "message").length;
  }, [rows]);

  // C3: Collect message IDs that have reactions
  const messageIdsWithReactions: Id<"messages">[] = useMemo(() => {
    return rows
      .filter(
        (row): row is Extract<ThreadRow, { type: "message" }> =>
          row.type === "message" && row.message.hasReactions
      )
      .map((row) => row.message._id as Id<"messages">);
  }, [rows]);

  // C3: Batch-fetch reactions for all reacted-to messages
  const reactionsData = useQuery(
    api.reactions.getByMessageIds,
    messageIdsWithReactions.length > 0
      ? { messageIds: messageIdsWithReactions }
      : "skip"
  );

  // C3: Build reaction lookup map
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, { reactionType: string; reactorName: string }[]>();
    if (!reactionsData) return map;
    for (const r of reactionsData) {
      const msgId = r.messageId ?? "";
      const existing = map.get(msgId) ?? [];
      existing.push({
        reactionType: r.reactionType,
        reactorName: r.reactorName,
      });
      map.set(msgId, existing);
    }
    return map;
  }, [reactionsData]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return 48;
      if (row.type === "divider") return 48;
      if (row.isContinuation) return 36;
      return 64;
    },
    overscan: 20,
  });

  // Scroll to bottom on initial load (once all messages are loaded)
  useEffect(() => {
    if (
      status === "Exhausted" &&
      rows.length > 0 &&
      !hasScrolledToBottom
    ) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
        setHasScrolledToBottom(true);
      });
    }
  }, [status, rows.length, hasScrolledToBottom, setHasScrolledToBottom, virtualizer]);

  // C4: Scroll to date when date jumper is used
  useEffect(() => {
    if (!scrollToDateKey || rows.length === 0) return;

    const targetIndex = rows.findIndex(
      (row) =>
        (row.type === "divider" && row.dateKey === scrollToDateKey) ||
        (row.type === "message" && row.message.dateKey === scrollToDateKey)
    );

    if (targetIndex >= 0) {
      virtualizer.scrollToIndex(targetIndex, { align: "start" });
    }

    setScrollToDateKey(null);
  }, [scrollToDateKey, rows, virtualizer, setScrollToDateKey]);

  // Loading state
  if (messages.length === 0 && status === "LoadingFirstPage") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 p-4">
          <MessageThreadSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ThreadToolbar
        isGroupChat={isGroupChat}
        participants={participants}
        dateRange={dateRange}
        activeDateKeys={activeDateKeys}
        totalMessages={messages.length}
        filteredMessages={filteredMessageCount}
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="px-4">
                  {row.type === "divider" ? (
                    <DayDivider dateKey={row.dateKey} />
                  ) : (
                    <MessageBubble
                      content={row.message.content}
                      senderName={row.message.senderName}
                      timestamp={row.message.timestamp}
                      isMe={row.isMe}
                      isGroupChat={isGroupChat}
                      messageType={row.message.messageType}
                      attachmentRef={row.message.attachmentRef}
                      avatarColor={row.avatarColor}
                      isContinuation={row.isContinuation}
                      reactions={
                        row.message.hasReactions ? (
                          <ReactionChips
                            reactions={reactionsByMessageId.get(row.message._id) as any ?? []}
                          />
                        ) : undefined
                      }
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Loading more indicator */}
        {status === "CanLoadMore" && (
          <div className="flex justify-center py-4">
            <div className="text-xs text-muted-foreground">Loading messages...</div>
          </div>
        )}
      </div>
    </div>
  );
}
