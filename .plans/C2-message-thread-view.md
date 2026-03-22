# C2: Message Thread View with Virtualized Scrolling — Execution Plan

## 1. Problem Summary

**What:** Build the core iMessage-style message thread view for `/browse/[conversationId]`. Messages display as bubbles with right-aligned blue (me) and left-aligned colored (others) styling, grouped by sender/time, separated by day dividers, and rendered with virtualized scrolling via `@tanstack/react-virtual` to handle 14K+ message threads without performance degradation.

**Why:** This is the primary reading experience of the entire app — the screen users will spend the most time on. It transforms raw database records into a visually familiar, comfortable message browsing interface. Without virtualization, rendering 14K+ DOM nodes would make the page unusable.

**Success criteria:**
- Messages load and render for any conversation via `/browse/[conversationId]`
- "Me" messages appear right-aligned with blue bubble (`oklch(0.45 0.15 250)`)
- Other participants' messages appear left-aligned with their `avatarColor`
- Consecutive messages from same sender within 2 minutes render in compact grouping (no repeated name, tighter spacing)
- Day dividers appear between date boundaries
- Timestamps show on hover, not permanently
- Attachment types show appropriate indicators (image, video, link, missing)
- Scroll starts at the bottom (most recent messages) on initial load
- Scrolling through 14K+ messages is smooth (no jank, no DOM explosion)
- Group chats show sender names with color coding
- Loading state shows `MessageThreadSkeleton`
- Thread header shows conversation title and participant info

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/[conversationId]/page.tsx` | Placeholder page | **Modify** — replace with thread view |
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Messages table schema | **Read-only** — reference for fields |
| `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` | `get` query (from C1) | **Read-only** — get conversation metadata |
| `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` | `formatDayHeader`, `formatMessageTime`, `isSameDay`, `isWithinMinutes` | **Read-only** — all needed for display and grouping |
| `/Users/robert.sawyer/Git/messagevault/lib/participant-colors.ts` | `ME_BUBBLE_COLOR`, `OTHER_BUBBLE_COLOR` | **Read-only** — bubble colors |
| `/Users/robert.sawyer/Git/messagevault/components/shared/message-type-icon.tsx` | `MessageTypeIcon` component | **Read-only** — attachment indicators |
| `/Users/robert.sawyer/Git/messagevault/components/shared/skeletons.tsx` | `MessageThreadSkeleton` | **Read-only** — loading state |
| `/Users/robert.sawyer/Git/messagevault/app/globals.css` | `--color-bubble-me`, `--color-bubble-other` CSS vars | **Read-only** — theme colors |
| `/Users/robert.sawyer/Git/messagevault/components/ui/tooltip.tsx` | shadcn Tooltip | **Read-only** — for hover timestamps |
| `/Users/robert.sawyer/Git/messagevault/components/ui/scroll-area.tsx` | shadcn ScrollArea | **Read-only** — may be useful |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/messages.ts` | Message queries: paginated list by conversation, count |
| `components/browse/message-thread.tsx` | Main thread container with virtualized scrolling |
| `components/browse/message-bubble.tsx` | Individual message bubble with alignment, color, grouping |
| `components/browse/day-divider.tsx` | Day separator pill between date boundaries |
| `components/browse/thread-header.tsx` | Conversation title bar above the thread |
| `lib/stores/use-browse-store.ts` | Zustand store for browse UI state (active conversation, scroll position) |

### Key Schema Fields — Messages Table

From `convex/schema.ts` lines 59-91:
```
messages: userId, conversationId, participantId, senderName, timestamp, dateKey,
          content, rawContent, messageType, attachmentRef, hasReactions, embedding
Indexes: by_conversationId_timestamp, by_userId_dateKey, by_conversationId_dateKey, by_participantId
```

### Virtualization Approach

`@tanstack/react-virtual` (already installed, v3.13.23) provides `useVirtualizer` for dynamic-height virtualized lists. Key considerations:
- Messages have variable heights (single line vs multi-paragraph)
- Day dividers are different height than message bubbles
- Need to estimate row height, then measure actual height after render
- The virtualizer renders only visible items + overscan buffer

### Data Loading Strategy

Convex `.paginate()` returns cursor-based pages. For the thread view:
- Load all messages for the conversation using the `by_conversationId_timestamp` index
- For conversations with 14K+ messages, Convex pagination handles this efficiently
- The `usePaginatedQuery` hook from `convex/react` manages cursor state automatically
- All messages need to be in memory for virtualization to work (the virtualizer needs to know total count)

## 3. Detailed Step-by-Step Implementation

### Step 1: Create Convex messages module

**File:** `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` (new)

**Why:** No message query functions exist yet. Need paginated messages for the thread view and a count query for metadata.

```typescript
// ABOUTME: Message queries — paginated list by conversation, count, and single fetch.
// ABOUTME: Primary data source for the browse thread view (C2) and future search/calendar views.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Get paginated messages for a conversation, ordered by timestamp ascending.
 * Uses Convex's built-in pagination for efficient cursor-based loading.
 */
export const listByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Verify conversation belongs to user
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== (userId as any)) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .paginate(args.paginationOpts);

    return result;
  },
});

/**
 * Get the count of messages in a conversation.
 */
export const countByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== (userId as any)) {
      return 0;
    }
    return conversation.messageCount;
  },
});
```

**Note on pagination:** Convex's `usePaginatedQuery` hook on the client will automatically manage loading more pages. The `numItems` parameter controls page size — use 200 for good balance between request count and payload size. The thread view will call `loadMore` to progressively load all messages.

**Verify:** Run `pnpm convex dev` to deploy. Verify `messages.listByConversation` appears in the Convex dashboard.

### Step 2: Create the DayDivider component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/day-divider.tsx` (new)

**Why:** Visual separator between days in the message thread — centered pill with formatted date text.

```typescript
// ABOUTME: Day divider pill shown between date boundaries in the message thread.
// ABOUTME: Displays formatted date like "Tuesday, January 15, 2023" as a centered pill.

import { formatDayHeader } from "@/lib/date-utils";

interface DayDividerProps {
  dateKey: string;
}

export function DayDivider({ dateKey }: DayDividerProps) {
  return (
    <div className="flex justify-center py-3">
      <div className="rounded-full bg-muted/60 px-3.5 py-1 text-[11px] font-medium text-muted-foreground">
        {formatDayHeader(dateKey)}
      </div>
    </div>
  );
}
```

**Design notes:**
- `bg-muted/60` creates a semi-transparent pill that's visible but doesn't dominate
- `text-[11px]` keeps the divider small and unobtrusive
- `py-3` provides generous spacing around the divider for visual breathing room

**Verify:** Visual check once integrated into the thread view.

### Step 3: Create the MessageBubble component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/message-bubble.tsx` (new)

**Why:** The core visual element — renders a single message as an iMessage-style bubble with appropriate alignment, color, and grouping behavior.

```typescript
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
```

**Design notes — why this looks good, not generic:**
- **Rounded corner variation:** Continuation bubbles soften their inner corner (e.g., `rounded-tr-lg` instead of full `rounded-2xl`), creating the characteristic iMessage "stacking" effect where grouped bubbles flow together visually
- **Color via CSS variables:** `var(--color-bubble-me)` and participant `avatarColor` are oklch values from the existing design system, giving rich, perceptually uniform colors
- **Typography:** `text-[14px] leading-relaxed` gives messages breathing room without feeling sparse. `whitespace-pre-wrap` preserves original line breaks from the message content
- **Hover timestamp:** Appears on mouse enter, keeping the interface clean but informative. Not a tooltip (which would need positioning logic) — just a simple span below the bubble
- **Max width constraints:** `max-w-[65%]` for me (slightly narrower) vs `max-w-[70%]` for others mirrors iMessage's asymmetric bubble widths

**Edge cases:**
- Very long messages (1000+ chars): `break-words` prevents horizontal overflow, `max-w-[65%]` constrains width
- Empty content (shouldn't happen but defensive): renders an empty bubble
- Attachment-only messages: shows icon + filename, then empty or minimal content below

**Verify:** Visual check once integrated into the thread. Confirm grouping logic, color coding, and hover behavior.

### Step 4: Create the ThreadHeader component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/thread-header.tsx` (new)

**Why:** The top of the thread view shows the conversation title, participant count, message count, and date range — essential context for what you're reading.

```typescript
// ABOUTME: Thread header bar showing conversation title, participants, and metadata.
// ABOUTME: Displays above the virtualized message list in the browse view.

import { formatDateRange } from "@/lib/date-utils";

interface ThreadHeaderProps {
  title: string;
  participantNames: string[];
  isGroupChat: boolean;
  messageCount: number;
  dateRange: { start: number; end: number };
}

export function ThreadHeader({
  title,
  participantNames,
  isGroupChat,
  messageCount,
  dateRange,
}: ThreadHeaderProps) {
  const displayTitle = participantNames.length > 0
    ? participantNames.join(", ")
    : title.replace("Messages with ", "");

  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {displayTitle}
        </h1>
        <p className="text-[12px] text-muted-foreground">
          {messageCount.toLocaleString()} messages
          {isGroupChat && ` · ${participantNames.length + 1} people`}
          {dateRange.start > 0 && ` · ${formatDateRange(dateRange.start, dateRange.end)}`}
        </p>
      </div>
    </div>
  );
}
```

**Note:** The `children` slot can be used in C4 for the date jumper and participant filter toolbar. For now, keep it simple with just the metadata display. C4 will add controls to the right side of this header.

**Verify:** Should render a clean header bar when loaded in the conversation page.

### Step 5: Create the Zustand browse store

**File:** `/Users/robert.sawyer/Git/messagevault/lib/stores/use-browse-store.ts` (new)

**Why:** Ephemeral UI state for the browse view — tracks scroll position, highlighted message (for search-to-browse in Stage 5), and will hold participant filter state (C4).

```typescript
// ABOUTME: Zustand store for browse view UI state — scroll position and highlights.
// ABOUTME: Ephemeral state only; resets on conversation switch.

import { create } from "zustand";

interface BrowseState {
  /** Message ID to scroll to and highlight (set by search-to-browse navigation) */
  highlightedMessageId: string | null;
  /** Whether the initial scroll-to-bottom has occurred */
  hasScrolledToBottom: boolean;
}

interface BrowseActions {
  setHighlightedMessageId: (id: string | null) => void;
  setHasScrolledToBottom: (done: boolean) => void;
  /** Reset all browse state (called on conversation switch) */
  resetBrowseState: () => void;
}

export type BrowseStore = BrowseState & BrowseActions;

export const useBrowseStore = create<BrowseStore>((set) => ({
  highlightedMessageId: null,
  hasScrolledToBottom: false,
  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),
  setHasScrolledToBottom: (done) => set({ hasScrolledToBottom: done }),
  resetBrowseState: () =>
    set({
      highlightedMessageId: null,
      hasScrolledToBottom: false,
    }),
}));
```

**Verify:** Import in the thread component to confirm it works.

### Step 6: Create the MessageThread component (virtualized)

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/message-thread.tsx` (new)

**Why:** This is the most complex component — a virtualized list of messages with day dividers, grouping logic, and scroll-to-bottom behavior. Uses `@tanstack/react-virtual` for performance.

```typescript
// ABOUTME: Virtualized message thread — the core browse view rendering engine.
// ABOUTME: Uses @tanstack/react-virtual for smooth scrolling through 14K+ message conversations.

"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MessageBubble } from "@/components/browse/message-bubble";
import { DayDivider } from "@/components/browse/day-divider";
import { MessageThreadSkeleton } from "@/components/shared/skeletons";
import { isSameDay, isWithinMinutes } from "@/lib/date-utils";
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
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { hasScrolledToBottom, setHasScrolledToBottom, resetBrowseState } =
    useBrowseStore();

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

  // Build flattened row list: insert day dividers between date boundaries
  const rows: ThreadRow[] = useMemo(() => {
    if (messages.length === 0) return [];

    const result: ThreadRow[] = [];
    let lastDateKey: string | null = null;
    let lastParticipantId: string | null = null;
    let lastTimestamp: number | null = null;

    for (const msg of messages) {
      // Insert day divider if date changed
      if (msg.dateKey !== lastDateKey) {
        result.push({ type: "divider", dateKey: msg.dateKey });
        lastParticipantId = null; // Reset grouping on day change
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
      // Small delay to let virtualizer measure
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(rows.length - 1, { align: "end" });
        setHasScrolledToBottom(true);
      });
    }
  }, [status, rows.length, hasScrolledToBottom, setHasScrolledToBottom, virtualizer]);

  // Loading state
  if (messages.length === 0 && status === "LoadingFirstPage") {
    return (
      <div className="flex-1 p-4">
        <MessageThreadSkeleton />
      </div>
    );
  }

  return (
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
  );
}
```

**Critical design decisions in this component:**

1. **`usePaginatedQuery` with auto-load:** The `useEffect` that calls `loadMore` when `status === "CanLoadMore"` progressively loads all messages. This is needed because the virtualizer needs to know the total row count to provide accurate scrollbar sizing. For a 14K message conversation, this will fire ~70 requests (200 per page) but they happen fast against Convex's indexes.

2. **Row flattening:** Messages and day dividers are flattened into a single `ThreadRow[]` array so the virtualizer treats them uniformly. Day dividers have a smaller estimated height (48px) vs messages (36-64px).

3. **Continuation grouping:** `isContinuation` is `true` when the same person sent the previous message within 2 minutes. This drives both visual styling (tighter spacing, no sender name) and estimated row height.

4. **Scroll to bottom:** On initial load, `scrollToIndex(rows.length - 1, { align: "end" })` scrolls to the most recent messages. The `hasScrolledToBottom` flag prevents this from firing on subsequent reactive updates.

5. **Dynamic measurement:** `ref={virtualizer.measureElement}` on each row lets the virtualizer measure actual heights after render, correcting the initial estimates. This is essential for variable-height content.

**Gotchas:**
- The `estimateSize` callback must be fast — it runs for every row on each render cycle. Avoid doing lookups inside it.
- `requestAnimationFrame` before `scrollToIndex` gives the virtualizer one frame to measure, preventing a scroll to the wrong position.
- The `px-4` padding is on the inner content, not the absolute-positioned wrapper, to avoid layout measurement issues.
- React Compiler is enabled — the `useMemo` for rows is critical for performance. Without it, the row array would rebuild on every render.

**Verify:** Load a conversation with 100+ messages. Confirm messages render correctly, day dividers appear, and scrolling is smooth. Then test with the largest available conversation.

### Step 7: Wire up the conversation page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/[conversationId]/page.tsx` (modify — full replacement)

**Why:** Replace the placeholder with the real thread view, loading conversation metadata and rendering the header + thread.

```typescript
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

  const participantNames = conversation.participants
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
        participants={conversation.participants.map((p) => ({
          _id: p._id,
          displayName: p.displayName,
          isMe: p.isMe,
          avatarColor: p.avatarColor,
        }))}
      />
    </div>
  );
}
```

**Note:** The page uses `use(params)` to unwrap the params Promise (Next.js 16+ pattern, already used in the existing placeholder). It's a client component because of `useQuery`.

**Verify:** Navigate to `/browse/[id]` with a valid conversation ID. Should see the header and message thread loading, then rendering messages.

## 4. Testing Strategy

### Manual Testing Steps

1. **Basic rendering:**
   - Navigate to a conversation with imported messages
   - Verify messages render as bubbles with correct alignment (me = right/blue, others = left)
   - Verify day dividers appear between date boundaries
   - Verify sender names appear above first message in a group (in group chats)

2. **Grouping logic:**
   - Find consecutive messages from the same sender within 2 minutes
   - Verify compact spacing (no sender name repeated, tighter vertical gap)
   - Find messages where sender changes or gap > 2 minutes
   - Verify full bubble rendering with sender name

3. **Scrolling performance:**
   - Test with the largest available conversation
   - Scroll rapidly through the entire thread
   - Verify no jank, no blank spaces, no visual glitches
   - Verify scroll starts at the bottom on initial load

4. **Hover timestamps:**
   - Hover over a message bubble
   - Verify time appears below the bubble
   - Move mouse away — time should disappear

5. **Attachment indicators:**
   - Find messages with `messageType` other than "text"
   - Verify appropriate icon appears (image, video, link, missing attachment)

6. **Not found:**
   - Navigate to `/browse/invalid-id`
   - Verify "Conversation Not Found" empty state appears

7. **Loading state:**
   - Hard refresh the conversation page
   - Verify skeleton loading state appears briefly

### Type Checking

```bash
pnpm build  # (with dev server stopped!)
```

## 5. Validation Checklist

- [ ] `convex/messages.ts` created with `listByConversation` paginated query
- [ ] `components/browse/message-thread.tsx` created with `@tanstack/react-virtual`
- [ ] `components/browse/message-bubble.tsx` created with alignment, color, grouping
- [ ] `components/browse/day-divider.tsx` created with formatted date pill
- [ ] `components/browse/thread-header.tsx` created with conversation metadata
- [ ] `lib/stores/use-browse-store.ts` created with browse UI state
- [ ] `app/(app)/browse/[conversationId]/page.tsx` updated with real thread view
- [ ] "Me" messages right-aligned blue, others left-aligned colored
- [ ] Compact grouping for same-sender messages within 2 minutes
- [ ] Day dividers between date boundaries
- [ ] Hover timestamps on message bubbles
- [ ] Attachment type indicators shown
- [ ] Scroll starts at bottom on initial load
- [ ] Smooth scrolling through 14K+ messages (no jank)
- [ ] Loading skeleton shown while data loads
- [ ] "Not found" empty state for invalid conversation IDs
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] ABOUTME comments on all new files

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| Auto-load all pages is slow for 14K+ messages | Thread feels empty for several seconds | Show "Loading messages..." indicator at top while pages load. The virtualizer renders what's available immediately — users can start scrolling older messages as new pages load. Messages appear in order (oldest first) so the bottom (newest) loads last. Consider loading from the end instead if this is unacceptable. |
| Dynamic height measurement causes scroll jumpiness | Scrollbar jumps or content shifts | `estimateSize` provides reasonable defaults. The `overscan: 20` ensures 20 extra rows are rendered above/below viewport, smoothing measurement transitions. If still jumpy, increase overscan to 40. |
| `usePaginatedQuery` hook type mismatch with query args | TypeScript error on `paginationOpts` | Convex's `usePaginatedQuery` passes pagination opts automatically. The query function receives them as a standard arg. Ensure the query's `args` validator matches Convex's pagination format. If the types don't align, the executor may need to use the `paginationOptsValidator` from `convex/server`. |
| React Compiler inline function warning | Build warning about Zustand selectors | Use stable function references (not inline arrows) for Zustand selectors per CLAUDE.md constraint. The browse store access uses destructuring which should be safe. |
| Very long messages (1000+ chars) cause oversized bubbles | Bubble takes up entire viewport | `max-w-[65%]` constrains width. `break-words` prevents horizontal overflow. Long messages will be tall but correctly contained. |
| Group chat with 10+ participants: sender colors look similar | Hard to distinguish senders | The 12-color palette in `participant-colors.ts` provides good distinction for up to 12 participants. Beyond that, colors repeat — acceptable for a family app. |

## 7. Assumptions & Dependencies

**Prerequisites:**
- C1 is complete (conversation list and navigation)
- Stage 2 (Import Pipeline) is complete with at least one conversation imported
- Convex dev watcher running

**Dependencies:**
- `@tanstack/react-virtual` v3.13.23 (already installed)
- `convex/react` for `usePaginatedQuery`
- `date-utils.ts` for `formatDayHeader`, `formatMessageTime`, `isSameDay`, `isWithinMinutes`
- `participant-colors.ts` for `ME_BUBBLE_COLOR`
- No new npm packages needed

**Decisions for executor:**
- **Loading direction:** The current approach loads messages oldest-first (ascending timestamp) and scrolls to bottom after all pages load. An alternative is to load newest-first with reverse rendering, which would show recent messages immediately. The ascending approach is simpler and matches the natural reading order. If the loading delay is noticeable with real data, the executor should consider adding a "Jump to recent" button that appears during loading.
- **Overscan tuning:** Start with `overscan: 20`. If scrolling feels laggy (rendering too many items) or blank (not rendering enough), adjust up/down.
- **`usePaginatedQuery` vs manual pagination:** The plan uses `usePaginatedQuery` which handles cursor management automatically. If the API shape doesn't match cleanly, the executor can fall back to manual cursor management with `useQuery` + state.
