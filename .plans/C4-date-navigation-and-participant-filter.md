# C4: Date Navigation and Participant Filter — Execution Plan

## 1. Problem Summary

**What:** Add two controls to the browse thread view: (1) a date jumper that scrolls the thread to a specific day within the conversation, and (2) a participant filter dropdown for group chats that shows only messages from selected people. Both controls appear in a toolbar above the message thread.

**Why:** A 14K+ message conversation spanning years needs navigation aids. Scrolling linearly to find "what we said last Christmas" is impractical. The date jumper provides random access to any point in time. The participant filter lets users focus on one voice in a noisy group chat. Together, they complete the browsing experience.

**Success criteria:**
- Date picker control lets user select a day → thread scrolls to that day's first message
- Date picker only allows selecting dates that have messages (within the conversation's date range)
- Participant filter dropdown appears only for group chats (`isGroupChat: true`)
- Multi-select participant filter: check/uncheck people to show/hide their messages
- Filtered message count shown (e.g., "Showing 2,847 of 14,521 messages")
- Day dividers still appear when filters are active
- Clear filter button to return to full conversation view
- Filter state resets when switching conversations
- Date jumper works correctly with filtered messages

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/components/browse/thread-header.tsx` | Thread header from C2 | **Modify** — add toolbar with date jumper and participant filter |
| `/Users/robert.sawyer/Git/messagevault/components/browse/message-thread.tsx` | Virtualized thread from C2 | **Modify** — add participant filter logic and scroll-to-date |
| `/Users/robert.sawyer/Git/messagevault/lib/stores/use-browse-store.ts` | Browse UI state from C2 | **Modify** — add filter state |
| `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` | Messages query from C2 | **Read-only** — messages already loaded, filtering is client-side |
| `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` | Conversation query from C1 | **Read-only** — get dateRange for date picker bounds |
| `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` | Date formatting utilities | **Read-only** — use `fromDateKey`, `toDateKey` |
| `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/[conversationId]/page.tsx` | Conversation page from C2 | **Modify** — pass filter state down |

### New Files to Create

| File | Purpose |
|------|---------|
| `components/browse/date-jumper.tsx` | Date picker popover for jumping to a specific day |
| `components/browse/participant-filter.tsx` | Multi-select dropdown for filtering by participant |
| `components/browse/thread-toolbar.tsx` | Toolbar container that holds date jumper + participant filter |

### shadcn/ui Components Available

Already installed: `Button`, `Tooltip`, `Badge`, `Separator`, `Dialog`, `Dropdown`, `Input`, `Label`, `ScrollArea`, `Sheet`

**May need to add:**
- `Popover` — for the date picker and participant filter dropdowns
- `Calendar` — shadcn calendar component for date picking
- `Checkbox` — for multi-select participant filter
- `Command` — for searchable participant list (if many participants)

The executor should run:
```bash
pnpm dlx shadcn@latest add popover calendar checkbox command
```

### Current Browse Store State

From `lib/stores/use-browse-store.ts`:
```typescript
interface BrowseState {
  highlightedMessageId: string | null;
  hasScrolledToBottom: boolean;
}
```

This needs to be extended with:
- `selectedParticipantIds: string[]` — empty means "show all"
- `scrollToDateKey: string | null` — set by date jumper, consumed by thread

### Filtering Approach

Per the plan.md: "Participant filtering is client-side on already-loaded messages (with virtualization, all messages are in memory via pagination)."

This means:
1. All messages are loaded into memory via `usePaginatedQuery` (C2)
2. The `rows` array in `MessageThread` filters based on `selectedParticipantIds`
3. The virtualizer re-renders with the filtered row set
4. Day dividers are preserved for context (a day divider appears if any messages from that day pass the filter)

## 3. Detailed Step-by-Step Implementation

### Step 1: Add required shadcn/ui components

**Command:**
```bash
pnpm dlx shadcn@latest add popover calendar checkbox
```

**Why:** The date jumper needs `Popover` + `Calendar`, and the participant filter needs `Popover` + `Checkbox`.

**Verify:** Check that `components/ui/popover.tsx`, `components/ui/calendar.tsx`, and `components/ui/checkbox.tsx` exist after installation.

**Gotcha:** The shadcn `Calendar` component depends on `react-day-picker`. The installer should add it automatically. Verify `react-day-picker` is in `package.json` dependencies after running the command. If not, run `pnpm add react-day-picker`.

### Step 2: Extend the browse Zustand store

**File:** `/Users/robert.sawyer/Git/messagevault/lib/stores/use-browse-store.ts` (modify)

**Why:** Add participant filter state and scroll-to-date state.

Replace the entire file:

```typescript
// ABOUTME: Zustand store for browse view UI state — scroll position, highlights, and filters.
// ABOUTME: Ephemeral state only; resets on conversation switch.

import { create } from "zustand";

interface BrowseState {
  /** Message ID to scroll to and highlight (set by search-to-browse navigation) */
  highlightedMessageId: string | null;
  /** Whether the initial scroll-to-bottom has occurred */
  hasScrolledToBottom: boolean;
  /** Participant IDs to show (empty = show all) */
  selectedParticipantIds: string[];
  /** Date key to scroll to (set by date jumper, consumed and cleared by thread) */
  scrollToDateKey: string | null;
}

interface BrowseActions {
  setHighlightedMessageId: (id: string | null) => void;
  setHasScrolledToBottom: (done: boolean) => void;
  setSelectedParticipantIds: (ids: string[]) => void;
  toggleParticipant: (id: string) => void;
  clearParticipantFilter: () => void;
  setScrollToDateKey: (dateKey: string | null) => void;
  /** Reset all browse state (called on conversation switch) */
  resetBrowseState: () => void;
}

export type BrowseStore = BrowseState & BrowseActions;

export const useBrowseStore = create<BrowseStore>((set) => ({
  highlightedMessageId: null,
  hasScrolledToBottom: false,
  selectedParticipantIds: [],
  scrollToDateKey: null,

  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),
  setHasScrolledToBottom: (done) => set({ hasScrolledToBottom: done }),
  setSelectedParticipantIds: (ids) => set({ selectedParticipantIds: ids }),
  toggleParticipant: (id) =>
    set((state) => {
      const current = state.selectedParticipantIds;
      const isSelected = current.includes(id);
      return {
        selectedParticipantIds: isSelected
          ? current.filter((pid) => pid !== id)
          : [...current, id],
      };
    }),
  clearParticipantFilter: () => set({ selectedParticipantIds: [] }),
  setScrollToDateKey: (dateKey) => set({ scrollToDateKey: dateKey }),
  resetBrowseState: () =>
    set({
      highlightedMessageId: null,
      hasScrolledToBottom: false,
      selectedParticipantIds: [],
      scrollToDateKey: null,
    }),
}));
```

**Verify:** TypeScript compiles. Existing consumers of the store (C2's `MessageThread`) still work because the interface is additive (new fields + methods only).

### Step 3: Create the DateJumper component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/date-jumper.tsx` (new)

**Why:** Provides a calendar popover that lets users select a specific date to scroll to in the conversation. Constrains selectable dates to the conversation's date range.

```typescript
// ABOUTME: Date picker popover for jumping to a specific day in a conversation.
// ABOUTME: Constrains selectable range to the conversation's date range.

"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useBrowseStore } from "@/lib/stores/use-browse-store";
import { toDateKey, fromDateKey } from "@/lib/date-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DateJumperProps {
  dateRange: { start: number; end: number };
  /** Set of dateKeys that have messages (for highlighting active days) */
  activeDateKeys?: Set<string>;
}

export function DateJumper({ dateRange, activeDateKeys }: DateJumperProps) {
  const [open, setOpen] = useState(false);
  const { setScrollToDateKey } = useBrowseStore();

  const fromDate = new Date(dateRange.start);
  const toDate = new Date(dateRange.end);

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    const dateKey = toDateKey(date.getTime());
    setScrollToDateKey(dateKey);
    setOpen(false);
  }

  // Modifier to style days that have messages
  const modifiers = activeDateKeys
    ? {
        hasMessages: (date: Date) => {
          const key = toDateKey(date.getTime());
          return activeDateKeys.has(key);
        },
      }
    : {};

  const modifiersStyles = activeDateKeys
    ? {
        hasMessages: {
          fontWeight: "700" as const,
        },
      }
    : {};

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Jump to date</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Navigate to a specific day</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          onSelect={handleSelect}
          fromDate={fromDate}
          toDate={toDate}
          defaultMonth={toDate}
          modifiers={modifiers}
          modifiersStyles={modifiersStyles}
        />
      </PopoverContent>
    </Popover>
  );
}
```

**Design notes:**
- **Default month:** Opens to the `toDate` (end of conversation range) since users often want to jump to recent dates
- **Date constraints:** `fromDate` and `toDate` disable selection outside the conversation's range
- **Active day highlighting:** Bold text on days that have messages helps users pick meaningful dates. The `activeDateKeys` set is built from the loaded messages.
- **Responsive:** Icon-only on small screens (`hidden sm:inline` on the label text)

**Verify:** Click the button. Calendar popover should open with the correct date range. Selecting a date should close the popover and trigger a scroll (once wired into the thread in Step 6).

### Step 4: Create the ParticipantFilter component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/participant-filter.tsx` (new)

**Why:** Multi-select dropdown for group chats that lets users filter messages to specific participants.

```typescript
// ABOUTME: Multi-select participant filter for group chat conversations.
// ABOUTME: Shows checkboxes for each participant; filters messages in the thread view.

"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useBrowseStore } from "@/lib/stores/use-browse-store";

interface Participant {
  _id: string;
  displayName: string;
  isMe: boolean;
  avatarColor: string;
}

interface ParticipantFilterProps {
  participants: Participant[];
}

export function ParticipantFilter({ participants }: ParticipantFilterProps) {
  const [open, setOpen] = useState(false);
  const { selectedParticipantIds, toggleParticipant, clearParticipantFilter } =
    useBrowseStore();

  const isFiltered = selectedParticipantIds.length > 0;
  const selectedCount = selectedParticipantIds.length;

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={isFiltered ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5 text-xs"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isFiltered
                ? `${selectedCount} selected`
                : "Filter people"}
            </span>
            {isFiltered && (
              <Badge
                variant="secondary"
                className="ml-0.5 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center sm:hidden"
              >
                {selectedCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <div className="p-3 pb-2">
            <p className="text-xs font-medium text-muted-foreground">
              Show messages from:
            </p>
          </div>
          <Separator />
          <ScrollArea className="max-h-64">
            <div className="p-2 space-y-1">
              {participants.map((participant) => {
                const isSelected = selectedParticipantIds.includes(
                  participant._id
                );
                return (
                  <button
                    key={participant._id}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                    onClick={() => toggleParticipant(participant._id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: participant.avatarColor }}
                    />
                    <span className="truncate">
                      {participant.displayName}
                      {participant.isMe && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          {isFiltered && (
            <>
              <Separator />
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    clearParticipantFilter();
                    setOpen(false);
                  }}
                >
                  Clear filter
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Quick clear button shown when filter is active */}
      {isFiltered && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={clearParticipantFilter}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Clear participant filter</span>
        </Button>
      )}
    </div>
  );
}
```

**Design notes:**
- **Color dot:** Small circle next to each name shows their bubble color, creating a visual link between the filter and the thread
- **"(you)" label:** Identifies the user's own participant entry
- **Clear button:** Both inside the popover and as a quick X button in the toolbar
- **Variant change:** Button switches from `ghost` to `secondary` when filter is active, providing visual feedback that filtering is in effect
- **ScrollArea:** Handles the unlikely case of 10+ participants in a group chat

**Verify:** Click the filter button. Popover should show all participants with checkboxes. Checking/unchecking should update the Zustand store.

### Step 5: Create the ThreadToolbar component

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/thread-toolbar.tsx` (new)

**Why:** Container component that positions the date jumper and participant filter above the thread, along with the filtered message count indicator.

```typescript
// ABOUTME: Toolbar above the message thread — date jumper, participant filter, filter count.
// ABOUTME: Only shows participant filter for group chats.

"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { DateJumper } from "@/components/browse/date-jumper";
import { ParticipantFilter } from "@/components/browse/participant-filter";
import { useBrowseStore } from "@/lib/stores/use-browse-store";

interface Participant {
  _id: string;
  displayName: string;
  isMe: boolean;
  avatarColor: string;
}

interface ThreadToolbarProps {
  isGroupChat: boolean;
  participants: Participant[];
  dateRange: { start: number; end: number };
  activeDateKeys?: Set<string>;
  totalMessages: number;
  filteredMessages: number;
}

export function ThreadToolbar({
  isGroupChat,
  participants,
  dateRange,
  activeDateKeys,
  totalMessages,
  filteredMessages,
}: ThreadToolbarProps) {
  const { selectedParticipantIds } = useBrowseStore();
  const isFiltered = selectedParticipantIds.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-between border-b border-border px-4 py-1.5">
        <div className="flex items-center gap-2">
          <DateJumper dateRange={dateRange} activeDateKeys={activeDateKeys} />
          {isGroupChat && (
            <ParticipantFilter participants={participants} />
          )}
        </div>

        {/* Filter count indicator */}
        {isFiltered && (
          <span className="text-[11px] text-muted-foreground">
            Showing {filteredMessages.toLocaleString()} of{" "}
            {totalMessages.toLocaleString()}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
```

**Design notes:**
- **Compact height:** `py-1.5` keeps the toolbar thin — it's a utility bar, not a hero element
- **Responsive layout:** Date jumper on left, filter count on right. Participant filter only appears for group chats.
- **Filter count:** Only shown when a filter is active, providing context on how many messages are hidden

**Verify:** Renders correctly in the conversation page. Participant filter only appears for group chats.

### Step 6: Integrate filtering and date navigation into MessageThread

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/message-thread.tsx` (modify)

**Why:** The thread component needs to:
1. Apply participant filter to the row list
2. Respond to `scrollToDateKey` by scrolling to the correct virtualizer index
3. Expose `activeDateKeys` and `filteredMessages` count for the toolbar

**Changes to the `rows` useMemo:**

The existing `rows` computation builds day dividers and message rows. Add participant filtering:

```typescript
// After the existing rows computation, add filter state
const { selectedParticipantIds, scrollToDateKey, setScrollToDateKey } = useBrowseStore();

// Build FULL rows first (unfiltered) for date key extraction
const allRows: ThreadRow[] = useMemo(() => {
  // ... existing row building logic (unchanged)
}, [messages, participantMap]);

// Collect active date keys from all messages (for DateJumper)
const activeDateKeys = useMemo(() => {
  const keys = new Set<string>();
  for (const msg of messages) {
    keys.add(msg.dateKey);
  }
  return keys;
}, [messages]);

// Apply participant filter
const isFiltered = selectedParticipantIds.length > 0;

const rows: ThreadRow[] = useMemo(() => {
  if (!isFiltered) return allRows;

  const filtered: ThreadRow[] = [];
  let lastDateKey: string | null = null;
  let lastParticipantId: string | null = null;
  let lastTimestamp: number | null = null;

  for (const row of allRows) {
    if (row.type === "divider") {
      // Include dividers provisionally — we'll prune empty ones after
      continue; // Skip dividers; we'll re-insert them based on filtered messages
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
```

**Changes for date navigation:**

Add a `useEffect` that responds to `scrollToDateKey`:

```typescript
// Scroll to date when date jumper is used
useEffect(() => {
  if (!scrollToDateKey || rows.length === 0) return;

  // Find the first row matching this date key
  const targetIndex = rows.findIndex(
    (row) =>
      (row.type === "divider" && row.dateKey === scrollToDateKey) ||
      (row.type === "message" && row.message.dateKey === scrollToDateKey)
  );

  if (targetIndex >= 0) {
    virtualizer.scrollToIndex(targetIndex, { align: "start", behavior: "smooth" });
  }

  // Clear the scroll target
  setScrollToDateKey(null);
}, [scrollToDateKey, rows, virtualizer, setScrollToDateKey]);
```

**Expose data for toolbar via props or by moving toolbar rendering inside MessageThread:**

The simplest approach is to export the `activeDateKeys` and `filteredMessageCount` from the thread component. But since the toolbar is a separate component rendered by the page, the cleanest architecture is to pass these as props from the conversation page. The page would need access to the loaded message data.

**Alternative approach — render toolbar inside MessageThread:** This keeps all message-dependent state in one place. Add the toolbar rendering above the scroll container:

```typescript
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
      {/* ... existing virtualizer content */}
    </div>
  </div>
);
```

This requires adding `dateRange` to the `MessageThreadProps` interface:

```typescript
interface MessageThreadProps {
  conversationId: Id<"conversations">;
  isGroupChat: boolean;
  participants: Participant[];
  dateRange: { start: number; end: number };  // Add this
}
```

And passing it from the conversation page.

**Verify:**
1. Date jumper: Select a date in the calendar → thread should smoothly scroll to that day's messages
2. Participant filter: Select one participant → only their messages shown, day dividers preserved, count indicator updated
3. Clear filter: Click X or "Clear filter" → all messages shown again
4. Conversation switch: Navigate to a different conversation → filter state resets

### Step 7: Update the conversation page to pass dateRange

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/[conversationId]/page.tsx` (modify)

**Why:** Pass the conversation's `dateRange` to `MessageThread` so the toolbar can constrain the date picker.

Find the `<MessageThread>` JSX and add the `dateRange` prop:

```typescript
<MessageThread
  conversationId={conversation._id}
  isGroupChat={conversation.isGroupChat}
  participants={conversation.participants.map((p) => ({
    _id: p._id,
    displayName: p.displayName,
    isMe: p.isMe,
    avatarColor: p.avatarColor,
  }))}
  dateRange={conversation.dateRange}  // Add this
/>
```

**Verify:** No TypeScript errors. Thread toolbar appears with date jumper and (for group chats) participant filter.

## 4. Testing Strategy

### Manual Testing Steps

1. **Date jumper — basic:**
   - Click "Jump to date" button
   - Calendar popover opens showing the conversation's date range
   - Select a date that has messages
   - Thread smoothly scrolls to that day's first message
   - Day divider for the selected date should be visible at the top

2. **Date jumper — edge cases:**
   - Select the earliest date in the conversation → should scroll to the very top
   - Select the latest date → should scroll to near the bottom
   - Dates outside the conversation range should be disabled/grayed out

3. **Participant filter — group chat:**
   - Navigate to a group chat conversation
   - Click "Filter people"
   - Select one participant → only their messages shown
   - Day dividers should still appear for dates where that person sent messages
   - "Showing X of Y messages" indicator should appear
   - Select additional participants → more messages appear
   - Click "Clear filter" → all messages shown, indicator disappears

4. **Participant filter — 1:1 chat:**
   - Navigate to a non-group chat conversation
   - Participant filter button should NOT appear
   - Only date jumper should be in the toolbar

5. **Filter + date jumper interaction:**
   - Apply a participant filter
   - Use the date jumper to navigate to a specific day
   - Should scroll to that day within the filtered messages
   - If the selected day has no messages from the filtered participants, scroll to the nearest visible day

6. **Filter persistence:**
   - Apply a filter in one conversation
   - Navigate to a different conversation
   - Navigate back to the first conversation
   - Filter should be cleared (reset on conversation switch)

### Type Checking

```bash
pnpm build  # (with dev server stopped!)
```

## 5. Validation Checklist

- [ ] `components/ui/popover.tsx`, `calendar.tsx`, `checkbox.tsx` added via shadcn
- [ ] `lib/stores/use-browse-store.ts` extended with filter and scroll-to-date state
- [ ] `components/browse/date-jumper.tsx` created with calendar popover
- [ ] `components/browse/participant-filter.tsx` created with multi-select checkboxes
- [ ] `components/browse/thread-toolbar.tsx` created as toolbar container
- [ ] `components/browse/message-thread.tsx` updated with filtering and scroll-to-date logic
- [ ] Date picker opens to correct month, constrains to conversation date range
- [ ] Selecting a date scrolls thread to that day
- [ ] Participant filter only appears for group chats
- [ ] Checking participants filters messages correctly
- [ ] Day dividers preserved when filter is active
- [ ] "Showing X of Y messages" indicator appears when filtered
- [ ] Clear filter button resets to full view
- [ ] Filter state resets on conversation switch
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] ABOUTME comments on all new files

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| shadcn Calendar depends on `react-day-picker` which isn't installed | Import error when using Calendar | Run `pnpm add react-day-picker date-fns` if the shadcn installer doesn't add them. Check `package.json` after running `pnpm dlx shadcn@latest add calendar`. |
| Date jumper scrolls to wrong position when filter is active | Scroll lands on wrong day or blank area | The `scrollToIndex` logic searches the `rows` array (which is already filtered). If the target date has no messages in the filtered set, it won't find a match. Add a fallback: find the nearest date that does have messages and scroll there instead, or temporarily clear the filter. |
| Participant filter doesn't re-trigger grouping correctly | Continuation grouping is wrong after filtering (messages from same sender appear grouped even if separated by filtered-out messages) | The filter logic in Step 6 recomputes `isContinuation` on the filtered sequence, not the original. This correctly handles adjacency changes. |
| Calendar component styling conflicts with dark theme | Calendar shows white background or illegible text | shadcn Calendar inherits from the theme. The existing oklch-based dark theme should apply. If not, add CSS overrides in `globals.css` for the `.rdp` (react-day-picker) class namespace. |
| React Compiler warning for inline Zustand selectors | Build warning | Use destructuring from `useBrowseStore()` (already the pattern) rather than inline selectors like `useBrowseStore((s) => s.field)`. |
| `virtualizer.scrollToIndex` with `behavior: "smooth"` doesn't work correctly with dynamic measurement | Scroll animation is janky or goes to wrong position | Fall back to instant scrolling: remove `behavior: "smooth"` and use the default instant scroll. Smooth scrolling with virtualization is notoriously tricky. |

## 7. Assumptions & Dependencies

**Prerequisites:**
- C2 is complete (message thread view with virtualized scrolling)
- C3 is complete (or in progress — reactions don't affect C4)
- At least one imported group chat conversation for testing the participant filter
- At least one conversation spanning multiple days for testing the date jumper

**Dependencies:**
- New shadcn components: `popover`, `calendar`, `checkbox`
- `react-day-picker` (installed by shadcn `calendar` component)
- `date-fns` (likely installed by `react-day-picker`)
- `@tanstack/react-virtual` (already installed, already used by C2)
- No other new npm packages

**Decisions for executor:**
- **Calendar component:** The plan uses shadcn's `Calendar` which wraps `react-day-picker`. If the executor finds it too heavy or poorly themed, an alternative is a simple month/year dropdown + day grid custom component. The custom approach is more work but gives full control over styling.
- **Active day highlighting:** The plan passes a set of date keys to bold active days. This is a nice-to-have — if the executor finds the `react-day-picker` modifiers API confusing, they can skip this enhancement and just constrain the date range.
- **Toolbar rendering location:** The plan renders the toolbar inside `MessageThread`. An alternative is rendering it in the conversation page and using Zustand/context to share data. The executor should use whichever feels cleaner after implementation.
- **Smooth scroll:** If smooth scrolling with `scrollToIndex` causes jank, use instant scrolling. A brief animation is nice but not worth visual glitches.
