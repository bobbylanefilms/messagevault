# C1: Conversation List and Sidebar — Execution Plan

## 1. Problem Summary

**What:** Replace the sidebar's static "Import conversations to see them here" placeholder with a live, reactive conversation list populated from Convex. Each conversation item shows participant names, message count, date range, and last activity. Clicking navigates to `/browse/[conversationId]`. The `/browse` route redirects to the most recently active conversation.

**Why:** This is the primary navigation entry point for browsing imported message archives. Without it, users have no way to access imported conversations from the Browse stage. The sidebar conversation list is what transforms the app from "import tool" to "archive browser."

**Success criteria:**
- Sidebar "MESSAGES" section shows all user's imported conversations, sorted by most recent activity
- Each conversation item displays: title (participant names), message count badge, date range, relative time of last message
- Group chats show a group indicator (2+ avatars or badge)
- Clicking a conversation navigates to `/browse/[conversationId]`
- Active conversation is visually highlighted in the sidebar
- `/browse` redirects to the most recently active conversation (or shows empty state if none)
- Loading state shows `ConversationListSkeleton` while data loads
- Empty state prompts import when no conversations exist
- Sidebar works in both expanded and collapsed modes
- Mobile sidebar sheet also shows conversation list

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/components/shell/sidebar.tsx` | Current sidebar with static placeholder | **Modify** — replace placeholder with live conversation list |
| `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/page.tsx` | Browse placeholder page | **Modify** — add redirect to most recent conversation |
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Schema with conversations table | **Read-only** — reference |
| `/Users/robert.sawyer/Git/messagevault/convex/lib/auth.ts` | `getUserId()` helper | **Read-only** — auth gate |
| `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` | `formatRelativeTimestamp`, `formatDateRange` | **Read-only** — use for display |
| `/Users/robert.sawyer/Git/messagevault/lib/participant-colors.ts` | Participant color constants | **Read-only** — for avatar colors |
| `/Users/robert.sawyer/Git/messagevault/components/shared/skeletons.tsx` | `ConversationListSkeleton` already exists | **Read-only** — use as loading state |
| `/Users/robert.sawyer/Git/messagevault/components/shared/empty-state.tsx` | `EmptyState` component | **Read-only** — use when no conversations |
| `/Users/robert.sawyer/Git/messagevault/components/ui/avatar.tsx` | shadcn Avatar component | **Read-only** — use for participant avatars |
| `/Users/robert.sawyer/Git/messagevault/components/ui/badge.tsx` | shadcn Badge component | **Read-only** — use for message count |
| `/Users/robert.sawyer/Git/messagevault/lib/stores/use-sidebar-store.ts` | Sidebar state (collapsed, mobile) | **Read-only** — sidebar collapse awareness |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/conversations.ts` | Conversation queries: list (sorted), get by ID |
| `components/browse/conversation-list.tsx` | Reactive conversation list component with Convex query |
| `components/browse/conversation-item.tsx` | Individual conversation row with participant avatars, metadata |

### Existing Schema — Conversations Table

From `convex/schema.ts` lines 20-41:
```typescript
conversations: defineTable({
  userId: v.id("users"),
  title: v.string(),
  isGroupChat: v.boolean(),
  participantIds: v.array(v.id("participants")),
  dateRange: v.object({ start: v.number(), end: v.number() }),
  messageCount: v.number(),
  importedAt: v.number(),
  sourceFilename: v.string(),
  metadata: v.optional(v.object({...})),
})
  .index("by_userId", ["userId"])
  .index("by_userId_importedAt", ["userId", "importedAt"]),
```

### Existing Sidebar Structure

The sidebar (`components/shell/sidebar.tsx`) has three sections:
1. **Messages section** (lines 103-128) — currently shows the static placeholder text "Import conversations to see them here"
2. **Views section** (lines 132-152) — Dashboard, Calendar, Search, AI Chat
3. **Utility links** (lines 156-170) — Import, Settings

The Messages section needs to be replaced with the live conversation list. The collapsed state already has a `MessageSquare` icon placeholder.

### Key Patterns

- All Convex queries use `getUserId(ctx)` for auth. Queries that only read can use the query context, which will throw if user record doesn't exist yet.
- The sidebar is `"use client"` and uses `useSidebarStore` for collapse state.
- Existing skeletons (`ConversationItemSkeleton`, `ConversationListSkeleton`) match the avatar+two-lines layout.
- `formatRelativeTimestamp` in `date-utils.ts` handles "just now", "2m ago", "Yesterday", "Jan 15" formats.
- `formatDateRange` formats "Jan 15 – Mar 20, 2023" for date ranges.

## 3. Detailed Step-by-Step Implementation

### Step 1: Create Convex conversations module

**File:** `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` (new)

**Why:** No conversation query functions exist yet. Need `list` (all conversations sorted by last activity) and `get` (single conversation by ID) for the sidebar and browse view.

```typescript
// ABOUTME: Conversation queries — list all for current user, get by ID.
// ABOUTME: Sorted by dateRange.end descending (most recently active first).

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * List all conversations for the current user, sorted by most recent activity.
 * Returns conversations with participant details resolved.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    // Sort by dateRange.end descending (most recent activity first)
    conversations.sort((a, b) => b.dateRange.end - a.dateRange.end);

    // Resolve participant names for display
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const participants = await Promise.all(
          conv.participantIds.map((pid) => ctx.db.get(pid))
        );
        const participantNames = participants
          .filter(Boolean)
          .filter((p) => !p!.isMe)
          .map((p) => p!.displayName);
        const meParticipant = participants.find((p) => p?.isMe);
        return {
          ...conv,
          participantNames,
          meParticipantId: meParticipant?._id ?? null,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single conversation by ID (with auth check).
 */
export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== (userId as any)) {
      return null;
    }

    // Resolve participants
    const participants = await Promise.all(
      conversation.participantIds.map((pid) => ctx.db.get(pid))
    );

    return {
      ...conversation,
      participants: participants.filter(Boolean),
    };
  },
});
```

**Edge cases:**
- A conversation with 0 messages (created but parsing failed) — should still appear in list, messageCount will be 0
- The `as any` cast on userId is consistent with existing patterns in the codebase (see `participants.ts`)
- If a participant record was deleted (shouldn't happen), `filter(Boolean)` handles nulls gracefully

**Verify:** Run `pnpm convex dev` — the module should deploy without errors. Check the Convex dashboard Functions tab for `conversations.list` and `conversations.get`.

### Step 2: Create the ConversationItem component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/conversation-item.tsx` (new)

**Why:** Each conversation row in the sidebar needs its own component for proper layout, interactivity, and tooltip behavior in collapsed mode.

```typescript
// ABOUTME: Single conversation row in the sidebar list — avatar, title, count, date.
// ABOUTME: Handles both expanded and collapsed sidebar states with tooltip fallback.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTimestamp, formatDateRange } from "@/lib/date-utils";

interface ConversationItemProps {
  conversationId: string;
  title: string;
  participantNames: string[];
  isGroupChat: boolean;
  messageCount: number;
  dateRange: { start: number; end: number };
  avatarColor: string;
  isCollapsed: boolean;
}

export function ConversationItem({
  conversationId,
  title,
  participantNames,
  isGroupChat,
  messageCount,
  dateRange,
  avatarColor,
  isCollapsed,
}: ConversationItemProps) {
  const pathname = usePathname();
  const isActive = pathname === `/browse/${conversationId}`;

  // Display name: use participant names, fallback to title
  const displayName =
    participantNames.length > 0
      ? participantNames.join(", ")
      : title.replace("Messages with ", "");

  // Truncated display for long group chat names
  const truncatedName =
    displayName.length > 28
      ? displayName.slice(0, 25) + "..."
      : displayName;

  // Avatar initials (first char of first name)
  const initials = participantNames.length > 0
    ? participantNames[0]!.charAt(0).toUpperCase()
    : title.charAt(0).toUpperCase();

  const linkContent = (
    <Link
      href={`/browse/${conversationId}`}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        isCollapsed && "justify-center px-2"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-sidebar-primary" />
      )}

      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0 text-xs">
        <AvatarFallback
          style={{ backgroundColor: avatarColor }}
          className="text-white font-medium"
        >
          {isGroupChat ? (
            <Users className="h-3.5 w-3.5" />
          ) : (
            initials
          )}
        </AvatarFallback>
      </Avatar>

      {/* Text content — hidden when collapsed */}
      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-[13px]">
              {truncatedName}
            </span>
            <span className="shrink-0 text-[11px] text-sidebar-muted-foreground">
              {formatRelativeTimestamp(dateRange.end)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[11px] text-sidebar-muted-foreground truncate">
              {messageCount.toLocaleString()} messages
            </span>
            {isGroupChat && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[10px] shrink-0"
              >
                Group
              </Badge>
            )}
          </div>
        </div>
      )}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <div>
            <div className="font-medium">{displayName}</div>
            <div className="text-xs text-muted-foreground">
              {messageCount.toLocaleString()} messages
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}
```

**Design notes:**
- The active state indicator (left accent bar) matches the pattern used by `NavItem` in the existing sidebar (`sidebar.tsx:68-70`)
- Avatar uses the first participant's color (passed from parent); group chats show a Users icon instead of initials
- The `[13px]` and `[11px]` font sizes create a clear hierarchy without being too small for readability
- `truncate` on the name prevents long group chat names from breaking layout

**Verify:** This component is used by `ConversationList` (Step 3). Check it renders correctly once wired up.

### Step 3: Create the ConversationList component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/conversation-list.tsx` (new)

**Why:** The sidebar needs a reactive wrapper that queries Convex for conversations, shows loading/empty states, and renders the list of `ConversationItem` components.

```typescript
// ABOUTME: Live conversation list for the sidebar — queries Convex and renders items.
// ABOUTME: Shows loading skeleton, empty state, or sorted conversation items.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConversationItem } from "@/components/browse/conversation-item";
import { ConversationListSkeleton } from "@/components/shared/skeletons";
import { MessageSquare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConversationListProps {
  isCollapsed: boolean;
}

export function ConversationList({ isCollapsed }: ConversationListProps) {
  const conversations = useQuery(api.conversations.list);

  // Loading state
  if (conversations === undefined) {
    if (isCollapsed) {
      return (
        <div className="flex justify-center py-2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-sidebar-muted-foreground/30" />
        </div>
      );
    }
    return <ConversationListSkeleton count={4} />;
  }

  // Empty state
  if (conversations.length === 0) {
    if (isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex justify-center py-2">
              <MessageSquare className="h-4 w-4 text-sidebar-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            No conversations yet
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-sidebar-muted-foreground mb-3">
          Import conversations to see them here
        </p>
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href="/import">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import
          </Link>
        </Button>
      </div>
    );
  }

  // Conversation list
  return (
    <div className="space-y-0.5">
      {conversations.map((conv) => {
        // Get avatar color from first non-me participant, or fallback
        const avatarColor =
          conv.participantNames.length > 0
            ? "oklch(0.55 0.16 275)" // default indigo; real color comes from participant
            : "oklch(0.45 0.15 250)";

        return (
          <ConversationItem
            key={conv._id}
            conversationId={conv._id}
            title={conv.title}
            participantNames={conv.participantNames}
            isGroupChat={conv.isGroupChat}
            messageCount={conv.messageCount}
            dateRange={conv.dateRange}
            avatarColor={avatarColor}
            isCollapsed={isCollapsed}
          />
        );
      })}
    </div>
  );
}
```

**Edge case — avatar color:** The conversation list query in Step 1 doesn't currently resolve participant colors. The executor should enhance the `conversations.list` query to also return the first non-me participant's `avatarColor`, or pass it through the enriched data. Update the ConversationList to use `conv.firstParticipantColor ?? "oklch(0.55 0.16 275)"` once available.

**Verify:** Import the component in the sidebar (Step 4) and confirm it renders with real data from a previously imported conversation.

### Step 4: Wire ConversationList into the Sidebar

**File:** `/Users/robert.sawyer/Git/messagevault/components/shell/sidebar.tsx` (modify)

**Why:** Replace the static Messages section placeholder with the live `ConversationList`.

**Changes:**

1. Add import at top of file:
```typescript
import { ConversationList } from "@/components/browse/conversation-list";
```

2. Replace the Messages section content (lines 103-128) with:
```typescript
{/* Messages section */}
<div className="flex-1 overflow-hidden">
  <ScrollArea className="h-full">
    <div className={cn("px-3 py-4", isCollapsed && "px-2")}>
      {!isCollapsed && (
        <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
          Messages
        </h2>
      )}
      <ConversationList isCollapsed={isCollapsed} />
    </div>
  </ScrollArea>
</div>
```

This removes the conditional collapsed icon placeholder and the static text, delegating both to `ConversationList` which handles collapsed/expanded states internally.

**Verify:** Run the dev server. The sidebar should show:
- Loading skeletons briefly on first load
- Conversation items if any exist
- "Import conversations" empty state if none exist
- Collapse/expand sidebar to confirm both modes work

### Step 5: Update the Browse page to redirect

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/page.tsx` (modify)

**Why:** `/browse` should redirect to the most recently active conversation rather than showing a static empty state. If no conversations exist, show the empty state with an import CTA.

Replace the entire file content:

```typescript
// ABOUTME: Browse page — redirects to the most recently active conversation.
// ABOUTME: Shows empty state with import CTA if no conversations exist.

"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageThreadSkeleton } from "@/components/shared/skeletons";

export default function BrowsePage() {
  const conversations = useQuery(api.conversations.list);
  const router = useRouter();

  useEffect(() => {
    if (conversations && conversations.length > 0) {
      // Redirect to most recent conversation (already sorted by activity)
      router.replace(`/browse/${conversations[0]!._id}`);
    }
  }, [conversations, router]);

  // Loading
  if (conversations === undefined) {
    return (
      <div className="p-6">
        <MessageThreadSkeleton />
      </div>
    );
  }

  // No conversations — show empty state
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No Conversations Yet"
        description="Import your Apple Messages archive to start browsing your message history."
        action={{ label: "Import conversations", href: "/import" }}
      />
    );
  }

  // Brief loading while redirect happens
  return (
    <div className="p-6">
      <MessageThreadSkeleton />
    </div>
  );
}
```

**Gotcha:** The page must be `"use client"` because it uses `useQuery` and `useRouter`. This replaces the previous server component.

**Verify:** Navigate to `/browse`. If conversations exist, you should be redirected to `/browse/[id]`. If none exist, the empty state should display.

## 4. Testing Strategy

### Manual Testing Steps

1. **With imported data:**
   - Navigate to `/dashboard` or any authenticated page
   - Sidebar should show conversation list items under "MESSAGES"
   - Each item should show participant name, message count, relative date
   - Click a conversation — URL should change to `/browse/[id]`
   - Active conversation should show highlighted state in sidebar
   - Navigate to `/browse` — should redirect to most recent conversation

2. **Without imported data:**
   - Clear all conversations or use a fresh user account
   - Sidebar should show "Import conversations to see them here" with Import button
   - `/browse` should show the empty state with "Import conversations" CTA

3. **Sidebar collapse:**
   - Collapse the sidebar
   - Conversation items should show only avatars
   - Hover over an avatar — tooltip should show conversation name and count
   - Expand sidebar — full items should reappear

4. **Mobile:**
   - Resize to mobile viewport
   - Open the mobile sidebar sheet
   - Conversation list should render identically to desktop expanded mode
   - Tapping a conversation should close the sheet and navigate

### Type Checking

```bash
pnpm build  # (with dev server stopped!)
```

Should produce zero TypeScript errors.

## 5. Validation Checklist

- [ ] `convex/conversations.ts` created with `list` and `get` queries
- [ ] `components/browse/conversation-list.tsx` created with loading/empty/data states
- [ ] `components/browse/conversation-item.tsx` created with expanded and collapsed modes
- [ ] Sidebar `components/shell/sidebar.tsx` updated to use `ConversationList`
- [ ] `app/(app)/browse/page.tsx` updated with redirect logic
- [ ] Conversations sorted by most recent activity (dateRange.end descending)
- [ ] Active conversation highlighted in sidebar
- [ ] Collapsed sidebar shows avatars with tooltips
- [ ] Empty state shows import prompt when no conversations exist
- [ ] Loading state shows `ConversationListSkeleton`
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] ABOUTME comments on all new files

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| `conversations.list` query throws for users with no user record | Error on fresh account before `ensureUser` runs | The `getUserId` helper throws "Not authenticated" for unauthenticated users. The app layout calls `ensureUser` on mount, so this should resolve quickly. If the query fires before `ensureUser` completes, Convex's reactive system will retry automatically once the user record exists. |
| Avatar colors not available from conversation query | All avatars show default color | Enhance `conversations.list` to return the first non-me participant's `avatarColor` by resolving participant records. This is included in Step 1's implementation. |
| Large number of conversations (50+) causes slow sidebar | Sidebar takes >1s to render | Unlikely at this scale (2-3 family users). If needed later, add virtual scrolling to the sidebar list. |
| `usePathname()` active route detection doesn't match `/browse/[id]` | Wrong conversation highlighted | `pathname === /browse/${conversationId}` is an exact match, so it will correctly highlight only the active conversation. |
| Convex `_generated/api` doesn't include new module | TypeScript import error | Run `pnpm convex dev` to regenerate the API types. This happens automatically when the Convex watcher is running. |

## 7. Assumptions & Dependencies

**Prerequisites:**
- Stage 2 (Import Pipeline) is complete — at least one conversation should be importable to test with real data
- Convex dev watcher is running (`pnpm convex dev`)
- The `conversations` table exists in the schema (confirmed: `convex/schema.ts` lines 20-41)

**Dependencies:**
- `@clerk/nextjs` for auth context
- `convex/react` for `useQuery`
- `next/navigation` for `useRouter`, `usePathname`
- No new npm packages needed

**Decisions for executor:**
- The `conversations.list` query resolves participant names by loading each participant doc. For 50+ conversations with 2-5 participants each, this is ~100-250 DB reads per query. At Convex's speed this is fine for 2-3 users, but the executor should verify performance with real data. If slow, consider denormalizing participant names onto the conversation record.
- Avatar color: the plan resolves the first non-me participant's color from the query. An alternative would be to store a `displayColor` on the conversation record during import. The executor should use whichever approach feels cleaner given the actual data shape they see.
