# C3: Reactions Display — Execution Plan

## 1. Problem Summary

**What:** Fetch and display reaction emoji chips below the messages they reference in the browse thread view. Reactions appear as small pill-shaped badges grouped by type, with hover tooltips showing who reacted. Only messages with `hasReactions: true` trigger reaction queries, keeping the common path (no reactions) fast.

**Why:** Reactions are a core part of the iMessage experience — the data is already imported and linked (via Stage 2's reaction resolution), but currently invisible. Showing reactions adds emotional context to conversations and makes the archive feel complete rather than stripped down.

**Success criteria:**
- Reaction emoji chips appear below reacted-to messages
- Reactions grouped by type: emoji + count when multiple of same type (e.g., "❤️ 2")
- Chips aligned to the same side as the parent message bubble (right for "me", left for others)
- Hover tooltip on each reaction chip shows reactor names (e.g., "Mom, Rob")
- Only messages with `hasReactions: true` trigger reaction fetches
- Reactions don't break the virtualized scrolling performance
- Messages without reactions render identically to before (no layout shift)

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Reactions table schema | **Read-only** — reference |
| `/Users/robert.sawyer/Git/messagevault/convex/import.ts` | `insertReactions` mutation (existing) | **Read-only** — reactions already imported and linked |
| `/Users/robert.sawyer/Git/messagevault/components/browse/message-bubble.tsx` | Message bubble from C2 | **Read-only** — already has `reactions` slot prop |
| `/Users/robert.sawyer/Git/messagevault/components/browse/message-thread.tsx` | Thread from C2 | **Modify** — wire reactions into message bubbles |
| `/Users/robert.sawyer/Git/messagevault/components/ui/tooltip.tsx` | shadcn Tooltip | **Read-only** — for hover reactor names |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/reactions.ts` | Reaction queries: batch fetch by message IDs |
| `components/browse/reaction-chips.tsx` | Reaction chip display component |

### Existing Schema — Reactions Table

From `convex/schema.ts` lines 93-110:
```typescript
reactions: defineTable({
  userId: v.id("users"),
  conversationId: v.id("conversations"),
  messageId: v.optional(v.id("messages")),  // resolved link
  participantId: v.id("participants"),
  reactionType: v.union(
    v.literal("liked"), v.literal("loved"), v.literal("laughed"),
    v.literal("disliked"), v.literal("emphasized"), v.literal("questioned")
  ),
  quotedText: v.string(),
  timestamp: v.number(),
})
  .index("by_messageId", ["messageId"])
  .index("by_conversationId", ["conversationId"]),
```

### How Reactions Are Created

During import (B4), `insertReactions` in `convex/import.ts`:
1. For each reaction, searches nearby messages for a content match
2. If matched, sets `reaction.messageId` to the matched message's `_id`
3. Sets `message.hasReactions = true` on the matched message
4. Unmatched reactions still get inserted but with `messageId` as undefined

### Existing Message Bubble Props

From `components/browse/message-bubble.tsx`, the `reactions` prop is already defined:
```typescript
interface MessageBubbleProps {
  // ... other props
  reactions?: React.ReactNode;  // Slot for reaction chips
}
```

And rendered:
```typescript
{reactions && (
  <div className={cn("mt-0.5", isMe ? "mr-1" : "ml-1")}>
    {reactions}
  </div>
)}
```

This slot-based approach means we don't need to modify `MessageBubble` at all — just pass reaction chips through it.

## 3. Detailed Step-by-Step Implementation

### Step 1: Create Convex reactions module

**File:** `/Users/robert.sawyer/Git/messagevault/convex/reactions.ts` (new)

**Why:** Need a query to fetch reactions for a batch of message IDs. Batching is important because the thread view might have dozens of reacted-to messages visible at once.

```typescript
// ABOUTME: Reaction queries — fetch reactions for a batch of message IDs.
// ABOUTME: Designed for efficient batch loading in the virtualized browse thread view.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Fetch all reactions for a set of message IDs.
 * Returns a flat array of reactions — the client groups them by messageId.
 *
 * Only called for messages that have hasReactions: true, so the batch
 * size is typically small relative to total visible messages.
 */
export const getByMessageIds = query({
  args: {
    messageIds: v.array(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    if (args.messageIds.length === 0) return [];

    // Fetch reactions for each message ID
    const allReactions = [];
    for (const messageId of args.messageIds) {
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
        .collect();

      // Filter to user's reactions only (data isolation)
      const userReactions = reactions.filter(
        (r) => r.userId === (userId as any)
      );

      // Resolve participant names for each reaction
      for (const reaction of userReactions) {
        const participant = await ctx.db.get(reaction.participantId);
        allReactions.push({
          ...reaction,
          reactorName: participant?.displayName ?? "Unknown",
        });
      }
    }

    return allReactions;
  },
});
```

**Design decision — query shape:** Returns a flat array instead of a map. The client-side grouping is trivial and avoids complex return types. The alternative (returning `Record<messageId, Reaction[]>`) would require more complex serialization.

**Performance note:** This query does N sequential reads where N = number of message IDs. For a typical conversation, the number of messages with reactions is small (maybe 5-20% of messages). The batch is further limited to only visible messages with `hasReactions: true`. This should be well under 100 reads per query call.

**Verify:** Deploy with `pnpm convex dev`. Test via Convex dashboard by querying with a known messageId that has reactions.

### Step 2: Create the ReactionChips component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/reaction-chips.tsx` (new)

**Why:** Visual display of reactions as small pills below message bubbles. Groups by reaction type, shows emoji + count, hover reveals reactor names.

```typescript
// ABOUTME: Reaction emoji chips displayed below reacted-to messages.
// ABOUTME: Groups reactions by type, shows count, hover tooltip reveals reactor names.

"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

type ReactionType =
  | "liked"
  | "loved"
  | "laughed"
  | "disliked"
  | "emphasized"
  | "questioned";

const REACTION_EMOJI: Record<ReactionType, string> = {
  liked: "\uD83D\uDC4D",      // 👍
  loved: "\u2764\uFE0F",       // ❤️
  laughed: "\uD83D\uDE02",     // 😂
  disliked: "\uD83D\uDC4E",    // 👎
  emphasized: "\u2757\u2757",   // ‼️
  questioned: "\u2753",         // ❓
};

interface Reaction {
  reactionType: ReactionType;
  reactorName: string;
}

interface ReactionChipsProps {
  reactions: Reaction[];
}

export function ReactionChips({ reactions }: ReactionChipsProps) {
  if (reactions.length === 0) return null;

  // Group by reaction type
  const grouped = new Map<ReactionType, string[]>();
  for (const r of reactions) {
    const existing = grouped.get(r.reactionType) ?? [];
    existing.push(r.reactorName);
    grouped.set(r.reactionType, existing);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-1">
        {Array.from(grouped.entries()).map(([type, names]) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded-full bg-muted/80 px-1.5 py-0.5 text-xs transition-colors hover:bg-muted"
              >
                <span className="text-[13px]">{REACTION_EMOJI[type]}</span>
                {names.length > 1 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {names.length}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {names.join(", ")}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
```

**Design notes:**
- **Pill shape:** `rounded-full bg-muted/80 px-1.5 py-0.5` creates a small, unobtrusive badge
- **Semi-transparent background:** `bg-muted/80` blends with the dark background without competing with the message bubbles
- **Count display:** Only shown when 2+ people gave the same reaction type. Single reactions show emoji alone.
- **Button element:** Used instead of div for accessibility — hover/focus states work naturally
- **Tooltip placement:** `side="top"` positions reactor names above the chip, avoiding collision with the message below

**Verify:** Render with mock data first to confirm visual correctness, then integrate with real Convex data.

### Step 3: Wire reactions into the MessageThread component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/message-thread.tsx` (modify)

**Why:** The thread component needs to:
1. Identify which visible messages have `hasReactions: true`
2. Query reactions for those message IDs
3. Pass reaction data into the `MessageBubble` via the `reactions` slot

**Changes:**

1. Add imports at top of file:
```typescript
import { useQuery } from "convex/react";
import { ReactionChips } from "@/components/browse/reaction-chips";
import type { Id } from "@/convex/_generated/dataModel";
```

2. After the `rows` useMemo, add a reaction data hook:

```typescript
// Collect message IDs that have reactions (from visible + overscan range)
const messageIdsWithReactions: Id<"messages">[] = useMemo(() => {
  return rows
    .filter(
      (row): row is Extract<ThreadRow, { type: "message" }> =>
        row.type === "message" && row.message.hasReactions
    )
    .map((row) => row.message._id as Id<"messages">);
}, [rows]);

// Batch-fetch reactions for all reacted-to messages
const reactionsData = useQuery(
  api.reactions.getByMessageIds,
  messageIdsWithReactions.length > 0
    ? { messageIds: messageIdsWithReactions }
    : "skip"
);

// Build a lookup map: messageId -> Reaction[]
const reactionsByMessageId = useMemo(() => {
  const map = new Map<string, { reactionType: string; reactorName: string }[]>();
  if (!reactionsData) return map;
  for (const r of reactionsData) {
    const existing = map.get(r.messageId ?? "") ?? [];
    existing.push({
      reactionType: r.reactionType,
      reactorName: r.reactorName,
    });
    map.set(r.messageId ?? "", existing);
  }
  return map;
}, [reactionsData]);
```

3. In the render, update the `MessageBubble` to pass reactions:

```typescript
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
        reactions={reactionsByMessageId.get(row.message._id) ?? []}
      />
    ) : undefined
  }
/>
```

**Important edge cases:**
- `reactionsData` is `undefined` while loading — reactions simply don't render until the query completes. This is the correct behavior (non-blocking).
- `"skip"` passed to `useQuery` when no messages have reactions — avoids an unnecessary empty query.
- The `reactionsByMessageId` map keys on `messageId` which could be `undefined` for unmatched reactions — those are keyed as empty string and never looked up, so they're harmlessly ignored.

**Performance note:** This queries ALL reactions for ALL reacted-to messages in the conversation at once, not just visible ones. For most conversations, the number of reacted-to messages is a small fraction of total messages. If a conversation has reactions on thousands of messages, the query could be slow. In that case, consider limiting the batch to only the visible range from the virtualizer. For a family app with typical usage, the full-conversation approach is simpler and sufficient.

**Verify:** Navigate to a conversation with imported reactions. Verify:
- Chips appear below reacted-to messages
- Emoji is correct for reaction type
- Count appears when 2+ of same type
- Hover shows reactor names
- Messages without reactions are unaffected

## 4. Testing Strategy

### Manual Testing Steps

1. **Reactions present:**
   - Navigate to a conversation that has reactions (check Convex dashboard for reactions with resolved `messageId`)
   - Verify emoji chips appear below the correct messages
   - Verify chips are aligned to the correct side (right for "me" messages, left for others)
   - Hover over a chip — reactor name(s) should appear in tooltip

2. **Grouped reactions:**
   - Find a message with multiple reactions of the same type
   - Verify the count number appears next to the emoji
   - Hover to see all reactor names listed

3. **Mixed reaction types:**
   - Find a message with different reaction types (e.g., both ❤️ and 😂)
   - Verify each type gets its own chip
   - Chips should appear in a horizontal row with gap

4. **No reactions:**
   - Navigate to a conversation or section with no reactions
   - Verify messages render identically to before C3
   - No empty space or layout shift where reactions would be

5. **Performance:**
   - Scroll rapidly through a conversation with reactions
   - Verify no visible delay in reaction chip appearance
   - Verify scrolling remains smooth

### Type Checking

```bash
pnpm build  # (with dev server stopped!)
```

## 5. Validation Checklist

- [ ] `convex/reactions.ts` created with `getByMessageIds` query
- [ ] `components/browse/reaction-chips.tsx` created with grouped emoji display
- [ ] `components/browse/message-thread.tsx` updated to fetch and pass reactions
- [ ] Reaction emoji chips appear below reacted-to messages
- [ ] Chips grouped by type with count for multiples
- [ ] Hover tooltip shows reactor names
- [ ] Chips aligned to same side as parent bubble
- [ ] Messages without reactions are unaffected (no layout shift)
- [ ] `hasReactions` flag correctly gates reaction queries
- [ ] Reactions load non-blockingly (thread renders before reactions arrive)
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] ABOUTME comments on all new files

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| Unresolved reactions (`messageId: undefined`) | Reaction chips don't appear for some reacted-to messages | These are reactions where the quoted text didn't match any message during import. They exist in the DB but have no `messageId`. The query filters them out naturally (they don't match any message ID in the batch). No action needed — the data fidelity issue is in the import, not the display. |
| Layout shift when reactions load asynchronously | Message bubble appears to jump when chips append below | The `reactions` prop is `undefined` until data loads, so the bubble renders at its natural height. When chips appear, the virtualizer's `measureElement` re-measures and adjusts. The shift is per-individual-message and very small (reaction chips are ~24px tall). With overscan, this usually happens off-screen. If it's noticeable, consider reserving space with a minimum-height placeholder when `hasReactions` is true. |
| Too many reactions in query (1000+ reacted messages) | Query times out or is slow | Extremely unlikely for a family app. If it happens, split the query into chunks of 100 message IDs. |
| Reaction emoji rendering across platforms | Emoji looks different on Mac/Windows/mobile | Using native Unicode emoji — rendering is platform-dependent. This is fine for a family app. |

## 7. Assumptions & Dependencies

**Prerequisites:**
- C2 is complete (message thread view with `MessageBubble` having the `reactions` slot prop)
- Stage 2 (Import Pipeline) completed with reaction resolution (reactions linked to messages via `messageId`)
- Convex dev watcher running

**Dependencies:**
- `convex/react` for `useQuery`
- shadcn `Tooltip` component
- No new npm packages needed

**Decisions for executor:**
- **Reaction query scope:** The plan queries ALL reactions for the conversation at once. If performance testing reveals this is too slow for conversations with many reactions, the executor should switch to querying only for message IDs in the virtualizer's visible range (using `virtualizer.getVirtualItems()` to determine the visible window). This adds complexity but limits query size.
- **Emphasized reaction emoji:** The plan uses ‼️ (`\u2757\u2757`) for "emphasized". The actual Apple Messages reaction may display differently. The executor should verify against real imported data and adjust the emoji if needed.
