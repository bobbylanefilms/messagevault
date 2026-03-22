# Handoff Plan: G1 — Dashboard

## 1. Problem Summary

Build the dashboard — the post-login landing page showing archive statistics, recent activity, a mini calendar heatmap, and quick navigation. Currently a placeholder EmptyState at `app/(app)/dashboard/page.tsx`.

**Why:** The dashboard is the first thing users see after login. Without it, they land on a generic empty state. The dashboard provides at-a-glance archive health, recent activity, and quick navigation to key features.

**Success Criteria:**
- Stats cards show total messages, conversations, date range, and top participants
- Recent activity shows last 5 messages with conversation context
- Mini calendar heatmap shows current year (clickable to full calendar)
- Conversation quick-nav links
- Import button for quick access
- Personalized welcome ("Welcome back, [name]")
- Graceful empty state when no data imported yet

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/app/(app)/dashboard/page.tsx` — Placeholder with `EmptyState` component. Will be completely replaced.
- `/Users/robert.sawyer/Git/messagevault/convex/users.ts` — Has `currentUser` query (returns full user object with displayName) and `ensureUser` mutation. No changes needed.
- `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` — Has `list` query returning all conversations sorted by dateRange.end descending, with resolved participant names. Reusable for conversation nav.
- `/Users/robert.sawyer/Git/messagevault/convex/participants.ts` — Has `list` query returning all participants. Reusable for top participant stats.
- `/Users/robert.sawyer/Git/messagevault/convex/dailyStats.ts` — Has `listByYear`, `getDateRange`, `getPreviousDay`, `getNextDay`. The `getDateRange` query returns `{earliestYear, latestYear}` or null.
- `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` — Has `listByDateKey` for date-specific queries. No "recent across all conversations" query exists.
- `/Users/robert.sawyer/Git/messagevault/components/calendar/calendar-heatmap.tsx` — Full GitHub-style heatmap. Accepts optional `filterFn` prop. Uses `useCalendarStore` for year selection and `api.dailyStats.listByYear`. Reusable for mini heatmap.
- `/Users/robert.sawyer/Git/messagevault/components/shared/page-header.tsx` — `PageHeader` with title, description, and children (action buttons) slot.
- `/Users/robert.sawyer/Git/messagevault/components/shared/empty-state.tsx` — `EmptyState` with icon, title, description, and optional action (label + href).
- `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` — `formatDateRange(start, end)`, `formatRelativeTimestamp(timestamp)`, `toDateKey()`, `fromDateKey()`.

### Existing Patterns

- All authenticated pages use `"use client"` directive and `useQuery`/`useMutation` from `convex/react`
- Components handle their own loading state via `useQuery` returning `undefined` while loading → show `Skeleton`
- Auth is handled at the layout level (`app/(app)/layout.tsx`) — pages don't need auth guards
- `getUserId(ctx)` pattern used in all Convex functions for user-scoped data access

### Installed UI Components

Card (with CardHeader, CardTitle, CardDescription, CardContent), Button, Skeleton, Badge, Tooltip, Avatar, Separator — all available in `components/ui/`.

## 3. Detailed Step-by-Step Implementation

### Step 1: Create `convex/dashboard.ts` — Stats and Recent Messages Queries

**File:** `/Users/robert.sawyer/Git/messagevault/convex/dashboard.ts` (new file)

**Changes:** Create two queries: `stats` (aggregate statistics) and `recentMessages` (last 5 messages across all conversations).

```typescript
// ABOUTME: Dashboard aggregate queries — stats overview and recent messages.
// ABOUTME: Computes totals from conversations and participants tables for the dashboard view.

import { query } from "./_generated/server";
import { getUserId } from "./lib/auth";

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
    const totalConversations = conversations.length;

    // Date range from conversations
    let earliestDate: number | null = null;
    let latestDate: number | null = null;
    for (const conv of conversations) {
      if (earliestDate === null || conv.dateRange.start < earliestDate) {
        earliestDate = conv.dateRange.start;
      }
      if (latestDate === null || conv.dateRange.end > latestDate) {
        latestDate = conv.dateRange.end;
      }
    }

    // Top participants by message count (exclude "me")
    const topParticipants = participants
      .filter((p) => !p.isMe)
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 5)
      .map((p) => ({
        _id: p._id,
        displayName: p.displayName,
        messageCount: p.messageCount,
        avatarColor: p.avatarColor,
      }));

    return {
      totalMessages,
      totalConversations,
      dateRange: earliestDate && latestDate
        ? { start: earliestDate, end: latestDate }
        : null,
      topParticipants,
    };
  },
});

export const recentMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    // Get recent dailyStats to find recent dates with activity
    const recentStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) => q.eq("userId", userId as any))
      .order("desc")
      .take(3);

    if (recentStats.length === 0) return [];

    // Load messages from those recent days
    const allMessages = [];
    for (const stat of recentStats) {
      const dayMessages = await ctx.db
        .query("messages")
        .withIndex("by_userId_dateKey", (q) =>
          q.eq("userId", userId as any).eq("dateKey", stat.dateKey)
        )
        .collect();
      allMessages.push(...dayMessages);
    }

    // Sort by timestamp descending, take 5
    allMessages.sort((a, b) => b.timestamp - a.timestamp);
    const recent = allMessages.slice(0, 5);

    // Resolve conversation titles
    const convIds = [...new Set(recent.map((m) => m.conversationId))];
    const convMap = new Map<string, string>();
    for (const cid of convIds) {
      const conv = await ctx.db.get(cid);
      if (conv) convMap.set(cid, conv.title);
    }

    return recent.map((m) => ({
      _id: m._id,
      conversationId: m.conversationId,
      conversationTitle: convMap.get(m.conversationId) ?? "Unknown",
      senderName: m.senderName,
      content: m.content,
      timestamp: m.timestamp,
      messageType: m.messageType,
    }));
  },
});
```

**Why:** Dashboard needs aggregate stats (total messages/conversations/date range/top participants) and recent messages. Neither query exists. Aggregating from conversations/participants tables is efficient since those are already denormalized.

**Edge cases:**
- No data imported: `stats` returns `{ totalMessages: 0, totalConversations: 0, dateRange: null, topParticipants: [] }`
- `recentMessages` returns `[]` when no dailyStats exist
- Conversation titles may include "Messages with..." prefix from import — display as-is

**Verify:** After deploying, test in Convex dashboard that `api.dashboard.stats` and `api.dashboard.recentMessages` return expected data.

### Step 2: Create Stats Cards Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/dashboard/stats-cards.tsx` (new file)

**Changes:** Create a `StatsCards` component that displays 4 stat cards in a responsive grid.

```typescript
// ABOUTME: Dashboard stats cards — total messages, conversations, date range, and top participant.
// ABOUTME: Responsive 2x2 / 4-across grid with icons, numbers, and labels.
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, MessagesSquare, CalendarDays, Users } from "lucide-react";
import { formatDateRange } from "@/lib/date-utils";

export function StatsCards() {
  const stats = useQuery(api.dashboard.stats);

  if (stats === undefined) {
    return <StatsCardsSkeleton />;
  }

  const cards = [
    {
      icon: MessageSquare,
      label: "Total Messages",
      value: stats.totalMessages.toLocaleString(),
    },
    {
      icon: MessagesSquare,
      label: "Conversations",
      value: stats.totalConversations.toString(),
    },
    {
      icon: CalendarDays,
      label: "Date Range",
      value: stats.dateRange
        ? formatDateRange(stats.dateRange.start, stats.dateRange.end)
        : "No data",
    },
    {
      icon: Users,
      label: "Top Contact",
      value: stats.topParticipants[0]?.displayName ?? "—",
      detail: stats.topParticipants[0]
        ? `${stats.topParticipants[0].messageCount.toLocaleString()} messages`
        : undefined,
      dotColor: stats.topParticipants[0]?.avatarColor,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <card.icon className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <div className="flex items-center gap-2">
                {card.dotColor && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: card.dotColor }}
                  />
                )}
                <p className="text-lg font-semibold leading-tight truncate">
                  {card.value}
                </p>
              </div>
              {card.detail && (
                <p className="text-xs text-muted-foreground">{card.detail}</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-start gap-3 p-4">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Why:** Stats cards provide at-a-glance archive health. The grid is responsive (2-col on mobile, 4-col on desktop). Each card has an icon, label, and value with consistent sizing.

**Edge cases:**
- No top participant: show em-dash
- Long conversation date ranges: `formatDateRange` handles cross-year formatting
- Zero messages/conversations: show "0" not empty

**Verify:** Cards render with correct data. Responsive grid collapses properly on mobile viewport.

### Step 3: Create Recent Activity Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/dashboard/recent-activity.tsx` (new file)

**Changes:** Compact list of recent messages with sender, conversation context, time, and content preview. Clickable rows navigate to browse view.

The component should:
- Use `useQuery(api.dashboard.recentMessages)` to fetch data
- Render inside a `Card` with "Recent Activity" header
- Each row: avatar color dot + sender name (bold) + conversation title (muted, in a Badge) + relative timestamp (right-aligned)
- Content preview below, truncated to 1 line
- Click on row navigates to `/browse/[conversationId]` using `router.push()`
- Show `EmptyState` if no messages ("No messages yet" with import link)
- Show `Skeleton` loading state while query resolves

**Design notes:**
- Use `formatRelativeTimestamp()` from `lib/date-utils.ts` for timestamps
- `cursor-pointer hover:bg-muted/50` on rows for clickability
- Divider between rows using `border-b border-border last:border-b-0`
- Limit content preview to ~80 chars for readability

**Verify:** Recent messages match the 5 most recent in the database. Click-through navigates correctly.

### Step 4: Create Mini Heatmap Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/dashboard/mini-heatmap.tsx` (new file)

**Changes:** Wraps the existing `CalendarHeatmap` at a smaller scale inside a Card. Includes a "View calendar" link.

The component should:
- Use `useQuery(api.dailyStats.getDateRange)` to check if data exists
- If no data, don't render (return null)
- Render a `Card` with "Message Activity" CardHeader and "View calendar →" link
- Inside CardContent, render `CalendarHeatmap` wrapped in a container with `overflow-hidden`
- Apply CSS transform `scale(0.7)` with `transform-origin: top left` to shrink the heatmap
- Adjust container height to match scaled content (avoid empty space)
- The parent container should have `overflow-hidden` to clip any overflow

**Why:** The calendar heatmap is already built (D1). Reusing it at smaller scale gives dashboard users a visual activity overview without duplicating code.

**Edge cases:**
- Calendar heatmap reads from `useCalendarStore` for year selection. The mini version should default to current year. Since the store defaults to `new Date().getFullYear()`, this works automatically.
- Scaling may cause subpixel rendering artifacts — test and adjust scale factor if needed

**Verify:** Mini heatmap renders the same data as the full calendar page. Clicking a cell navigates to `/calendar/[dateKey]`. "View calendar" link goes to `/calendar`.

### Step 5: Create Conversation Nav Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/dashboard/conversation-nav.tsx` (new file)

**Changes:** Quick-access list showing top 5 conversations with message counts and navigation links.

The component should:
- Use `useQuery(api.conversations.list)` to fetch conversations
- Render inside a `Card` with "Conversations" header and "Browse all →" link to `/browse`
- Show top 5 conversations (already sorted by most recent activity from the query)
- Each row: conversation title (truncated) + participant names (muted) + message count Badge
- Click navigates to `/browse/[conversationId]`
- Empty state if no conversations

**Design notes:**
- Compact rows with `py-2.5 px-3` padding
- Participant names joined with ", " and truncated
- Message count as a subtle `Badge variant="secondary"` right-aligned

**Verify:** Conversations match what appears in the browse sidebar. Navigation works correctly.

### Step 6: Compose Dashboard Page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/dashboard/page.tsx` (replace entirely)

**Changes:** Replace the placeholder EmptyState with the full dashboard layout.

```typescript
// ABOUTME: Dashboard page — archive overview with stats, activity, heatmap, and navigation.
// ABOUTME: Post-login landing page showing personalized welcome and quick access to features.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Upload, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { MiniHeatmap } from "@/components/dashboard/mini-heatmap";
import { ConversationNav } from "@/components/dashboard/conversation-nav";

export default function DashboardPage() {
  const user = useQuery(api.users.currentUser);
  const stats = useQuery(api.dashboard.stats);

  // Show empty state if no conversations imported
  const hasData = stats !== undefined && stats.totalConversations > 0;
  const isLoading = stats === undefined;

  return (
    <div className="flex flex-col">
      <PageHeader title="Dashboard">
        <Button variant="outline" size="sm" asChild>
          <Link href="/import">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Link>
        </Button>
      </PageHeader>

      <div className="px-6 py-6 space-y-6">
        {/* Welcome greeting */}
        {user && (
          <p className="text-lg text-muted-foreground">
            Welcome back, <span className="text-foreground font-medium">{user.displayName}</span>
          </p>
        )}

        {!isLoading && !hasData ? (
          <EmptyState
            icon={LayoutDashboard}
            title="No messages yet"
            description="Import your first conversation to see your message archive overview."
            action={{ label: "Import conversations", href: "/import" }}
          />
        ) : (
          <>
            {/* Stats cards — full width */}
            <StatsCards />

            {/* Two-column layout */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <MiniHeatmap />
                <RecentActivity />
              </div>
              <div>
                <ConversationNav />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

**Why:** The dashboard page orchestrates all sub-components into a cohesive layout. The two-query approach (user for welcome, stats for empty check) runs in parallel via Convex's reactive system.

**Edge cases:**
- User is null while loading: don't show welcome text yet
- Stats undefined while loading: show children anyway (they have their own skeletons)
- No conversations: show EmptyState instead of the full dashboard

**Verify:** Full dashboard renders with all sections. Empty state shows when no data. Welcome greeting shows correct name. Responsive layout works on mobile.

## 4. Testing Strategy

- **With data:** Verify dashboard loads with imported data. Check that stats cards show correct totals matching the conversations and participants tables.
- **Without data:** Clear all data or use a fresh user. Verify the empty state appears with import CTA.
- **Recent messages:** Check that the 5 most recent messages match what's in the database, with correct conversation titles.
- **Mini heatmap:** Verify it renders the same data as `/calendar`. Click a cell and verify navigation to `/calendar/[dateKey]`.
- **Conversation nav:** Verify conversations listed match the browse sidebar. Click and verify navigation.
- **Welcome greeting:** Verify it shows the user's displayName from Clerk/Convex.
- **Type check:** Run `pnpm build` to verify no TypeScript errors.

## 5. Validation Checklist

- [ ] Stats cards show total messages, conversations, date range, and top participant
- [ ] Stats card values match actual database totals
- [ ] Recent activity shows 5 most recent messages with correct conversation titles
- [ ] Clicking a recent activity item navigates to `/browse/[conversationId]`
- [ ] Mini heatmap renders current year's data
- [ ] Clicking a heatmap cell navigates to `/calendar/[dateKey]`
- [ ] "View calendar" link navigates to `/calendar`
- [ ] Conversation nav shows top 5 conversations
- [ ] Import button navigates to `/import`
- [ ] Empty state shown when no data exists
- [ ] Welcome greeting shows user's display name
- [ ] All components show loading skeletons while queries resolve
- [ ] Responsive layout: 1-column mobile, 3-column desktop
- [ ] No TypeScript errors (`pnpm build`)

## 6. Potential Issues & Mitigations

- **Stats computation cost:** The stats query iterates all conversations and participants. For 50+ conversations this is ~100 document reads — well within Convex limits. If the archive grows to 500+ conversations, consider pre-aggregating into a dedicated stats table.
- **Recent messages query efficiency:** Uses dailyStats index to find recent days, then loads messages for those days. This could load hundreds of messages to return 5. For extremely high-volume days (1000+ messages), this is wasteful. Mitigation: take only the most recent 1 dailyStats, or add a `by_userId_timestamp` index on messages for direct queries.
- **Mini heatmap scaling:** CSS `transform: scale()` doesn't affect layout flow. The container must manually set its height to match the scaled content. Test at different viewport sizes.
- **CalendarHeatmap dependency on store:** The heatmap reads `selectedYear` from `useCalendarStore`. If the user navigates to calendar and changes the year, then returns to dashboard, the mini heatmap will show that year. This is acceptable behavior.

## 7. Assumptions & Dependencies

- **Stages 1–6 complete** (confirmed — all 26 projects done)
- **CalendarHeatmap component** reusable without modification (confirmed — accepts `filterFn` prop)
- **`conversations.list` query** returns enriched conversations with `participantNames` (confirmed)
- **shadcn/ui components** installed: Card, Button, Skeleton, Badge, Tooltip (confirmed)
- **Date utils** available: `formatDateRange`, `formatRelativeTimestamp` (confirmed)
- **User has imported data** for non-empty state testing (import pipeline complete)
- **No new shadcn/ui components needed** for this project
