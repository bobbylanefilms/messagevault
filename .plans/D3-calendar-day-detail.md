# D3 — Calendar Day Detail View

### 1. Problem Summary

**What:** Build the day detail view at `/calendar/[dateKey]` that shows all messages from a selected day, grouped by conversation, with previous/next day navigation.

**Why:** The heatmap answers "when was I active?" — the day detail view answers "what did we talk about on that specific day?" It's the drill-down companion to the heatmap, bridging the calendar visualization to the full message archive.

**Success Criteria:**
- Page shows all messages from the selected day across all conversations
- Messages grouped by conversation with banner headers
- Previous/next day navigation arrows that skip empty days
- Message count header ("42 messages on January 15, 2023")
- Messages rendered with the same bubble styling as the browse view (reuse C2 components)
- Back-to-heatmap navigation
- Click a message to navigate to its position in the browse view
- Empty state when no messages exist for the selected day

---

### 2. Current State Analysis

**Existing files to modify:**
- `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/[dateKey]/page.tsx` — Placeholder page with `EmptyState`. Will be replaced entirely.
- `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` — Needs a new query for fetching messages by dateKey.

**Existing components to reuse:**
- `/Users/robert.sawyer/Git/messagevault/components/browse/message-bubble.tsx` — iMessage-style bubbles. Core rendering component.
- `/Users/robert.sawyer/Git/messagevault/components/browse/reaction-chips.tsx` — Reaction emoji chips.
- `/Users/robert.sawyer/Git/messagevault/components/browse/day-divider.tsx` — Not directly needed (single day view), but pattern reference.
- `/Users/robert.sawyer/Git/messagevault/components/shared/page-header.tsx` — Page header with action slot.
- `/Users/robert.sawyer/Git/messagevault/components/shared/empty-state.tsx` — For days with no messages.
- `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` — `fromDateKey()`, `formatDayHeader()`, `isWithinMinutes()` all reusable.
- `/Users/robert.sawyer/Git/messagevault/lib/participant-colors.ts` — `ME_BUBBLE_COLOR` for bubble coloring.

**Convex indexes available:**
- `messages.by_userId_dateKey` on `[userId, dateKey]` — cross-conversation day query
- `dailyStats.by_userId_dateKey` on `[userId, dateKey]` — for prev/next navigation

**Pattern reference:**
- `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/[conversationId]/page.tsx` — Shows how params are resolved in App Router (`use(params)`), loading/error states, and how `MessageBubble` is consumed.
- `/Users/robert.sawyer/Git/messagevault/components/browse/message-thread.tsx` — Shows message grouping logic (continuation detection via `isWithinMinutes`), participant resolution, and reaction fetching pattern.

---

### 3. Detailed Step-by-Step Implementation

#### Step 1: Add Convex queries for day detail view

**File:** `/Users/robert.sawyer/Git/messagevault/convex/messages.ts`

Add a new query at the end of the file:

```typescript
/**
 * Get all messages for a specific date across all conversations.
 * Used by the calendar day detail view (D3).
 * Returns messages sorted by timestamp ascending.
 */
export const listByDateKey = query({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any).eq("dateKey", args.dateKey)
      )
      .collect();

    // Sort by timestamp ascending
    messages.sort((a, b) => a.timestamp - b.timestamp);

    return messages;
  },
});
```

**File:** `/Users/robert.sawyer/Git/messagevault/convex/dailyStats.ts` (created in D1)

Add two new queries for prev/next day navigation:

```typescript
/**
 * Get the previous day with messages before the given dateKey.
 * Returns null if no earlier day exists.
 */
export const getPreviousDay = query({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Query all stats before this dateKey, take the last one
    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q
          .eq("userId", userId as any)
          .lt("dateKey", args.dateKey)
      )
      .collect();

    if (stats.length === 0) return null;
    return stats[stats.length - 1]!.dateKey;
  },
});

/**
 * Get the next day with messages after the given dateKey.
 * Returns null if no later day exists.
 */
export const getNextDay = query({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Query the first stat after this dateKey
    const stat = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q
          .eq("userId", userId as any)
          .gt("dateKey", args.dateKey)
      )
      .first();

    return stat?.dateKey ?? null;
  },
});
```

**Why separate queries for prev/next:** Each query is simple, efficient (uses the index directly), and reactive (updates if data changes). The `getPreviousDay` query collects and takes the last because Convex `.order("desc")` on compound index fields may not work as expected with range operators. An alternative is to collect all and reverse — the dataset is small (max ~3650 records per user).

**Gotcha:** The `getPreviousDay` query collects all earlier records to find the last one. For users with many years of data, this could return thousands of records. A more efficient approach: query with `.order("desc")` if Convex supports it on range queries, or use the `getDateRange` approach to narrow the search. Test with actual data volume.

**Verify:** Test in Convex dashboard: `dailyStats.getPreviousDay({ dateKey: "2023-06-15" })` should return a dateKey like "2023-06-14" (or earlier if June 14 has no messages).

---

#### Step 2: Create the DayNavigation component

**File:** `/Users/robert.sawyer/Git/messagevault/components/calendar/day-navigation.tsx` (NEW)

```typescript
// ABOUTME: Previous/next day navigation arrows for the calendar day detail view.
// ABOUTME: Skips days without messages, with a back-to-heatmap link.

"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Grid3X3 } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fromDateKey } from "@/lib/date-utils";

interface DayNavigationProps {
  dateKey: string;
}

export function DayNavigation({ dateKey }: DayNavigationProps) {
  const prevDay = useQuery(api.dailyStats.getPreviousDay, { dateKey });
  const nextDay = useQuery(api.dailyStats.getNextDay, { dateKey });

  const formatNav = (dk: string) => {
    const d = fromDateKey(dk);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1">
        {/* Back to heatmap */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href="/calendar">
                <Grid3X3 className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to heatmap</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Previous day */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!prevDay}
              asChild={!!prevDay}
            >
              {prevDay ? (
                <Link href={`/calendar/${prevDay}`}>
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span><ChevronLeft className="h-4 w-4" /></span>
              )}
            </Button>
          </TooltipTrigger>
          {prevDay && (
            <TooltipContent>{formatNav(prevDay)}</TooltipContent>
          )}
        </Tooltip>

        {/* Next day */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!nextDay}
              asChild={!!nextDay}
            >
              {nextDay ? (
                <Link href={`/calendar/${nextDay}`}>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span><ChevronRight className="h-4 w-4" /></span>
              )}
            </Button>
          </TooltipTrigger>
          {nextDay && (
            <TooltipContent>{formatNav(nextDay)}</TooltipContent>
          )}
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
```

**Design rationale:**
- Grid icon for "back to heatmap" — visual connection to the grid they came from
- Prev/next arrows with tooltips showing the target date
- Disabled state when no adjacent day exists (beginning/end of data)
- `Link` for navigation (not `router.push`) — enables middle-click-to-open-in-new-tab
- Compact layout fits in the `PageHeader` action slot

**Verify:** Click prev/next arrows. Confirm navigation skips empty days. Confirm disabled state at data boundaries.

---

#### Step 3: Create the ConversationGroup component

**File:** `/Users/robert.sawyer/Git/messagevault/components/calendar/conversation-group.tsx` (NEW)

```typescript
// ABOUTME: Groups messages by conversation within the calendar day detail view.
// ABOUTME: Shows a conversation banner header followed by message bubbles.

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MessageBubble } from "@/components/browse/message-bubble";
import { ReactionChips } from "@/components/browse/reaction-chips";
import { isWithinMinutes } from "@/lib/date-utils";
import { ME_BUBBLE_COLOR } from "@/lib/participant-colors";
import { MessageSquare } from "lucide-react";

interface Message {
  _id: string;
  content: string;
  senderName: string;
  timestamp: number;
  dateKey: string;
  participantId: string;
  conversationId: string;
  messageType: "text" | "image" | "video" | "link" | "attachment_missing";
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
  // Participant lookup
  const participantMap = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const p of participants) {
      map.set(p._id, p);
    }
    return map;
  }, [participants]);

  // Message IDs with reactions for batch fetch
  const messageIdsWithReactions: Id<"messages">[] = useMemo(() => {
    return messages
      .filter((m) => m.hasReactions)
      .map((m) => m._id as Id<"messages">);
  }, [messages]);

  const reactionsData = useQuery(
    api.reactions.getByMessageIds,
    messageIdsWithReactions.length > 0
      ? { messageIds: messageIdsWithReactions }
      : "skip"
  );

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

  // Display title: participant names for 1:1, conversation title for group
  const displayTitle = conversationTitle.replace("Messages with ", "");

  return (
    <div className="space-y-1">
      {/* Conversation banner */}
      <Link
        href={`/browse/${conversationId}`}
        className="group flex items-center gap-2 rounded-lg bg-card/50 px-4 py-2.5 transition-colors hover:bg-card"
      >
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{displayTitle}</span>
        <span className="text-xs text-muted-foreground">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
      </Link>

      {/* Messages */}
      <div className="px-4 pb-2">
        {messages.map((msg, index) => {
          const participant = participantMap.get(msg.participantId);
          const isMe = participant?.isMe ?? false;
          const avatarColor = isMe
            ? ME_BUBBLE_COLOR
            : participant?.avatarColor ?? "var(--color-bubble-other)";

          // Continuation: same sender within 2 minutes
          const prevMsg = index > 0 ? messages[index - 1] : null;
          const isContinuation =
            prevMsg !== null &&
            prevMsg.participantId === msg.participantId &&
            isWithinMinutes(prevMsg.timestamp, msg.timestamp, 2);

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
                msg.hasReactions ? (
                  <ReactionChips
                    reactions={reactionsByMessageId.get(msg._id) as any ?? []}
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
```

**Design rationale:**
- Conversation banner is a link to the browse view — click to see full conversation context
- Banner uses `bg-card/50` (semi-transparent card background) for subtle visual separation
- Hover effect on banner for discoverability
- Reuses `MessageBubble` and `ReactionChips` directly from the browse view (C2/C3)
- Continuation grouping logic is identical to `message-thread.tsx`
- Reactions fetched in batch per conversation group (same pattern as browse view)

**Gotcha:** The banner links to `/browse/[conversationId]` without scrolling to the specific date. A future enhancement could add `?date=2023-01-15` to the browse view URL and have it scroll to that date. For now, linking to the conversation is sufficient.

**Verify:** Conversation groups render with banners. Click banner to navigate to browse view. Message bubbles render correctly (alignment, colors, grouping). Reactions display.

---

#### Step 4: Update the day detail page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/[dateKey]/page.tsx`

Replace the placeholder entirely:

```typescript
// ABOUTME: Calendar day detail view — all messages from a specific date grouped by conversation.
// ABOUTME: Drill-down from the calendar heatmap with prev/next navigation.

"use client";

import { use, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConversationGroup } from "@/components/calendar/conversation-group";
import { DayNavigation } from "@/components/calendar/day-navigation";
import { formatDayHeader } from "@/lib/date-utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarDayPage({
  params,
}: {
  params: Promise<{ dateKey: string }>;
}) {
  const { dateKey } = use(params);

  const messages = useQuery(api.messages.listByDateKey, { dateKey });
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  // Loading
  if (messages === undefined || conversations === undefined || participants === undefined) {
    return (
      <div>
        <PageHeader
          title={formatDayHeader(dateKey)}
          description="Loading..."
        />
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  // No messages on this day
  if (messages.length === 0) {
    return (
      <div>
        <PageHeader
          title={formatDayHeader(dateKey)}
          description="No messages found"
        >
          <DayNavigation dateKey={dateKey} />
        </PageHeader>
        <EmptyState
          icon={Calendar}
          title="No messages"
          description={`No messages were found for ${formatDayHeader(dateKey)}.`}
          action={{ label: "Back to calendar", href: "/calendar" }}
        />
      </div>
    );
  }

  // Group messages by conversation
  const conversationGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        conversationId: string;
        messages: typeof messages;
      }
    >();

    for (const msg of messages) {
      const existing = groups.get(msg.conversationId) ?? {
        conversationId: msg.conversationId,
        messages: [],
      };
      existing.messages.push(msg);
      groups.set(msg.conversationId, existing);
    }

    return Array.from(groups.values());
  }, [messages]);

  // Build conversation and participant lookups
  const conversationMap = useMemo(() => {
    const map = new Map<string, (typeof conversations)[number]>();
    for (const conv of conversations) {
      map.set(conv._id, conv);
    }
    return map;
  }, [conversations]);

  const participantList = useMemo(() => {
    return participants.map((p) => ({
      _id: p._id,
      displayName: p.displayName,
      isMe: p.isMe,
      avatarColor: p.avatarColor,
    }));
  }, [participants]);

  const formattedDate = formatDayHeader(dateKey);

  return (
    <div>
      <PageHeader
        title={formattedDate}
        description={`${messages.length.toLocaleString()} message${messages.length !== 1 ? "s" : ""} across ${conversationGroups.length} conversation${conversationGroups.length !== 1 ? "s" : ""}`}
      >
        <DayNavigation dateKey={dateKey} />
      </PageHeader>

      <div className="space-y-6 p-6">
        {conversationGroups.map((group) => {
          const conv = conversationMap.get(group.conversationId);
          if (!conv) return null;

          return (
            <ConversationGroup
              key={group.conversationId}
              conversationId={group.conversationId}
              conversationTitle={conv.title}
              messages={group.messages as any}
              participants={participantList}
              isGroupChat={conv.isGroupChat}
            />
          );
        })}
      </div>
    </div>
  );
}
```

**Design rationale:**
- Page header shows the formatted date ("Tuesday, January 15, 2023") with message count and conversation count
- `DayNavigation` in the header action slot — compact, always accessible
- Conversation groups spaced with `space-y-6` for clear visual separation
- Messages not virtualized — day views are typically small (10-100 messages). If a day has 500+ messages, virtualization could be added later.
- All data loaded via `useQuery` (Convex reactive) — updates live if someone imports new data

**Verify:** Navigate to `/calendar/2023-01-15` (replace with a date that has messages). Verify: header shows formatted date and count, conversations grouped with banners, messages styled correctly, prev/next arrows work.

---

### 4. Testing Strategy

**Type-check:**
```bash
pnpm build  # (with dev server stopped)
```

**Manual browser tests:**
1. From the heatmap, click a cell with messages — verify navigation to day detail
2. Verify messages are grouped by conversation
3. Verify conversation banners show title and message count
4. Click a conversation banner — verify navigation to browse view
5. Click prev arrow — verify navigation to previous day with messages
6. Click next arrow — verify navigation to next day with messages
7. At first/last day — verify prev/next disabled respectively
8. Click "Back to heatmap" — verify navigation to `/calendar`
9. Navigate to a day with no messages — verify empty state
10. Verify message bubbles: alignment (me=right, others=left), grouping, colors, reactions

**Edge cases:**
- Day with messages in only one conversation
- Day with messages across 5+ conversations
- Day with a single message
- Day with reactions on messages

---

### 5. Validation Checklist

- [ ] `convex/messages.ts` has new `listByDateKey` query
- [ ] `convex/dailyStats.ts` has `getPreviousDay` and `getNextDay` queries
- [ ] `components/calendar/day-navigation.tsx` renders prev/next/back controls
- [ ] `components/calendar/conversation-group.tsx` renders grouped messages
- [ ] `app/(app)/calendar/[dateKey]/page.tsx` integrates all components
- [ ] Messages grouped by conversation with banner headers
- [ ] Message bubbles reuse `MessageBubble` from `components/browse/`
- [ ] Reactions display correctly via `ReactionChips`
- [ ] Prev/next navigation skips empty days
- [ ] Empty state for days with no messages
- [ ] Back-to-heatmap navigation works
- [ ] No TypeScript errors
- [ ] Every new file starts with two `ABOUTME:` comment lines
- [ ] All Convex queries use `getUserId(ctx)` auth pattern

---

### 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| `getPreviousDay` is slow with years of data | Measure query time in Convex dashboard | Use `.order("desc").first()` if Convex supports it, or limit the lookback range (e.g., only search within the same year). |
| Too many messages on a single day cause slow render | Test with a high-activity day (100+ messages) | Day views are rarely >200 messages. If needed, add virtualization later. |
| Participant data missing for some messages | Messages reference a deleted/merged participant | `participantMap.get()` falls back to default values. Already handled with `?? false` and `?? "var(--color-bubble-other)"`. |
| `as any` type casts in ConversationGroup messages prop | TypeScript errors | The message type from `listByDateKey` may have slightly different typing than what `ConversationGroup` expects. Adjust the interface or use `Doc<"messages">` from Convex. |
| Date key in URL is invalid format | User manually types URL | `formatDayHeader()` and `fromDateKey()` handle arbitrary strings gracefully (produce "Invalid Date"). Add a validation guard if needed. |

---

### 7. Assumptions & Dependencies

**Must be true before execution:**
- D1 is complete (heatmap exists, `convex/dailyStats.ts` exists with `listByYear` and `getDateRange`)
- Browse view components exist and are working (C2 stage complete): `MessageBubble`, `ReactionChips`
- Convex dev environment is running
- At least one conversation imported with messages across multiple days

**Dependencies:**
- `api.messages.listByDateKey` — new query (created in Step 1)
- `api.dailyStats.getPreviousDay` / `getNextDay` — new queries (created in Step 1)
- `api.conversations.list` — already exists
- `api.participants.list` — already exists
- `api.reactions.getByMessageIds` — already exists

**Decisions for executor:**
- **Click-to-browse navigation:** The plan links conversation banners to `/browse/[conversationId]` without date scrolling. If the executor wants to add date-scroll behavior, they'd need to either (a) add a `?scrollTo=2023-01-15` param to the browse route and handle it in `useBrowseStore`, or (b) defer this as a follow-up. Recommend deferring.
- **Virtualization:** Not included in this plan. If testing reveals performance issues on high-message days, add `@tanstack/react-virtual` following the pattern in `message-thread.tsx`.
