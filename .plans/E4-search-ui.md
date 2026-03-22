# E4 — Search UI

### 1. Problem Summary

**What:** Build the full search page at `/search` — search input with debounce, mode toggle, filter bar, result display with highlighted match terms and surrounding context, click-through navigation to the browse view, and polished loading/empty states.

**Why:** The search backend (E1–E3) is useless without a UI. Users need an intuitive interface to find specific messages across their entire archive. The search page is one of the four primary views (browse, calendar, search, chat) and needs to feel like a first-class citizen — not an afterthought.

**Success Criteria:**
- Search input with 300ms debounce at the top of the page
- Segmented control toggling between Keyword / Semantic / Hybrid modes
- Filter bar with conversation, participant, date range, and message type selectors
- Results displayed as message bubbles with highlighted match terms
- 1 surrounding context message before/after each result (dimmed)
- Result count and per-conversation distribution stats
- Click a result to navigate to `/browse/[conversationId]` with the message highlighted
- Search state persisted in URL query parameters
- Loading skeletons during search execution
- Empty state with search suggestion cards
- Responsive — works on both desktop and mobile

---

### 2. Current State Analysis

**Existing file to replace:**
- `/Users/robert.sawyer/Git/messagevault/app/(app)/search/page.tsx` — Currently a placeholder `EmptyState`. Will be completely rewritten.

**Backend dependency (E3):**
- `search:hybridSearch` action — the single search entry point. Returns `{ results, totalCount, conversationCounts }` where each result includes `contextBefore`, `contextAfter`, `_score`, and full message fields.

**Existing components to reuse:**
- `components/browse/message-bubble.tsx` — iMessage-style bubbles with `isMe`, `avatarColor`, `isContinuation` props. **However**, for search results we'll create a simplified variant that supports match highlighting and doesn't need virtualization.
- `components/shared/page-header.tsx` — Page header with title and action slot.
- `components/shared/empty-state.tsx` — Centered empty state with icon, title, description, and optional CTA.
- `components/shared/skeletons.tsx` — Skeleton loading patterns.
- `components/calendar/calendar-filters.tsx` — Pattern reference for URL-param-based filter dropdowns using shadcn `Select`.
- `components/ui/select.tsx`, `components/ui/input.tsx`, `components/ui/button.tsx`, `components/ui/badge.tsx`, `components/ui/popover.tsx`, `components/ui/calendar.tsx` — All available shadcn components.

**Existing patterns:**
- URL search params for filter state (see `calendar-filters.tsx` — uses `useSearchParams`, `useRouter`, `usePathname`)
- Convex `useAction` hook for calling actions from client components
- `"use client"` directive required for any component using hooks
- All Lucide icons imported from `lucide-react`
- Zustand store pattern (see `lib/stores/use-browse-store.ts`) — the browse store already has `highlightedMessageId` and `setHighlightedMessageId` for search-to-browse navigation

**Theme tokens available:**
- `--color-background` (oklch 0.13), `--color-card` (oklch 0.16), `--color-primary` (oklch 0.65 blue)
- `--color-muted`, `--color-muted-foreground`, `--color-border`, `--color-input`
- `--color-bubble-me` (blue), `--color-bubble-other` (gray)
- Participant colors: `--color-participant-0` through `--color-participant-11`

**Dependencies already installed:**
- `date-fns` — for date range formatting
- `react-day-picker` + shadcn `calendar.tsx` + `popover.tsx` — for date range picker
- `lucide-react` — icons
- `zustand` — for browse store cross-page state

---

### 3. Detailed Step-by-Step Implementation

#### UI Design Specification

**Layout Structure:**
```
┌─────────────────────────────────────────────────┐
│ PageHeader: "Search"                             │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ 🔍 Search your messages...            [✕]  │ │  ← Search input (full width)
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ [Keyword] [Semantic] [■ Hybrid]   ← Mode toggle  │
│                                                  │
│ [All conversations ▾] [All people ▾]             │
│ [Date range ▾] [All types ▾]  [Clear filters]   │
├─────────────────────────────────────────────────┤
│ Found 47 results in 12 conversations             │  ← Stats bar
├─────────────────────────────────────────────────┤
│                                                  │
│ ┌ Result Card ─────────────────────────────────┐ │
│ │ 📍 Messages with Mom · Jan 15, 2023         │ │  ← Conversation + date header
│ │                                              │ │
│ │     [context: dimmed bubble]   Rob: yeah...  │ │  ← Context before (muted)
│ │     [MATCHED bubble]  Mom: happy ████day!    │ │  ← Highlighted match
│ │     [context: dimmed bubble]   Rob: thanks!  │ │  ← Context after (muted)
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌ Result Card ─────────────────────────────────┐ │
│ │ ...                                          │ │
│ └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Visual Design Decisions:**
- **Search input**: Large, prominent, with `Search` Lucide icon on the left and a clear (X) button when text is present. Uses `--color-card` background with `--color-border` ring on focus, transitioning to `--color-primary` ring.
- **Mode toggle**: Custom segmented control (not tabs) — three pills in a `--color-muted` track. Active pill gets `--color-primary` background with white text. Inactive pills have transparent background with `--color-muted-foreground` text.
- **Filter bar**: Row of shadcn `Select` dropdowns matching the calendar filter pattern — small (`h-8`), `text-xs`, consistent widths. Date range uses a Popover + Calendar combo.
- **Result cards**: Each card sits on a `--color-card` background with `--color-border` border, rounded-xl. The conversation name and date are a subtle header. Context messages render at 60% opacity with smaller text. The matched message renders at full opacity with match terms highlighted using a `--color-primary` background at 30% opacity (semi-transparent blue highlight).
- **Stats bar**: Subtle text bar between filters and results. "Found 47 results in 12 conversations" in `text-sm text-muted-foreground`.
- **Empty state (no query)**: Large centered search icon with "Search your messages" title and suggestion chips below: "birthday", "vacation", "funny moments", "holiday plans".
- **Empty state (no results)**: "No results found" with suggestion to try different keywords or switch to Hybrid mode.
- **Loading state**: 3-4 skeleton result cards with shimmer animation.

---

#### Step 1: Create the Zustand search store

**File:** `/Users/robert.sawyer/Git/messagevault/lib/stores/use-search-store.ts` (new file)

```typescript
// ABOUTME: Zustand store for search page ephemeral UI state.
// ABOUTME: Manages search query, mode, filters, results, and loading state.

import { create } from "zustand";

type SearchMode = "keyword" | "semantic" | "hybrid";
type MessageType = "text" | "image" | "video" | "link" | "attachment_missing";

interface SearchFilters {
  conversationId: string | null;
  participantId: string | null;
  dateRangeStart: number | null;
  dateRangeEnd: number | null;
  messageType: MessageType | null;
}

interface ContextMessage {
  _id: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface SearchResult {
  _id: string;
  conversationId: string;
  participantId: string;
  senderName: string;
  content: string;
  timestamp: number;
  dateKey: string;
  messageType: string;
  attachmentRef?: string;
  hasReactions: boolean;
  _score: number;
  contextBefore: ContextMessage[];
  contextAfter: ContextMessage[];
}

interface SearchState {
  query: string;
  mode: SearchMode;
  filters: SearchFilters;
  results: SearchResult[];
  totalCount: number;
  conversationCounts: Record<string, number>;
  isSearching: boolean;
  hasSearched: boolean; // true after first search (distinguishes "no query" from "no results")
}

interface SearchActions {
  setQuery: (query: string) => void;
  setMode: (mode: SearchMode) => void;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  clearFilters: () => void;
  setResults: (results: SearchResult[], totalCount: number, conversationCounts: Record<string, number>) => void;
  setIsSearching: (searching: boolean) => void;
  reset: () => void;
}

const initialFilters: SearchFilters = {
  conversationId: null,
  participantId: null,
  dateRangeStart: null,
  dateRangeEnd: null,
  messageType: null,
};

export const useSearchStore = create<SearchState & SearchActions>((set) => ({
  query: "",
  mode: "hybrid",
  results: [],
  totalCount: 0,
  conversationCounts: {},
  isSearching: false,
  hasSearched: false,
  filters: { ...initialFilters },

  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
  clearFilters: () => set({ filters: { ...initialFilters } }),
  setResults: (results, totalCount, conversationCounts) =>
    set({ results, totalCount, conversationCounts, hasSearched: true }),
  setIsSearching: (isSearching) => set({ isSearching }),
  reset: () =>
    set({
      query: "",
      mode: "hybrid",
      results: [],
      totalCount: 0,
      conversationCounts: {},
      isSearching: false,
      hasSearched: false,
      filters: { ...initialFilters },
    }),
}));
```

**Why Zustand instead of URL params?** The spec says "search state managed with URL query parameters for bookmark/share support." However, results (large arrays) can't go in URLs. The approach: **sync `query`, `mode`, and filter values to URL params** for bookmarkability, but keep results and loading state in Zustand. The URL-sync happens in the page component.

**Edge case:** React Compiler is enabled — avoid inline arrow functions as Zustand selectors. The store action functions defined in `create()` are fine; it's the consumption side that matters (use stable selector references in components).

#### Step 2: Create the search mode toggle component

**File:** `/Users/robert.sawyer/Git/messagevault/components/search/search-mode-toggle.tsx` (new file)

```typescript
// ABOUTME: Segmented control for search mode — Keyword, Semantic, or Hybrid.
// ABOUTME: Custom pill-based toggle matching the app's dark theme.

"use client";

import { cn } from "@/lib/utils";

type SearchMode = "keyword" | "semantic" | "hybrid";

interface SearchModeToggleProps {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
}

const modes: { value: SearchMode; label: string }[] = [
  { value: "keyword", label: "Keyword" },
  { value: "semantic", label: "Semantic" },
  { value: "hybrid", label: "Hybrid" },
];

export function SearchModeToggle({ value, onChange }: SearchModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === mode.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
```

**Design notes:** The segmented control uses a `bg-muted` track (oklch 0.22) with pills. The active pill gets `bg-primary` (blue, oklch 0.65) with white text, matching the app's accent color. Inactive pills have `text-muted-foreground` with a hover state.

#### Step 3: Create the search filter bar component

**File:** `/Users/robert.sawyer/Git/messagevault/components/search/search-filter-bar.tsx` (new file)

```typescript
// ABOUTME: Search filter bar — conversation, participant, date range, and message type selectors.
// ABOUTME: Follows the calendar-filters.tsx pattern using shadcn Select and URL-synced state.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { X, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

interface SearchFilterBarProps {
  conversationId: string | null;
  participantId: string | null;
  dateRangeStart: number | null;
  dateRangeEnd: number | null;
  messageType: string | null;
  onConversationChange: (id: string | null) => void;
  onParticipantChange: (id: string | null) => void;
  onDateRangeChange: (start: number | null, end: number | null) => void;
  onMessageTypeChange: (type: string | null) => void;
  onClearAll: () => void;
}

export function SearchFilterBar({
  conversationId,
  participantId,
  dateRangeStart,
  dateRangeEnd,
  messageType,
  onConversationChange,
  onParticipantChange,
  onDateRangeChange,
  onMessageTypeChange,
  onClearAll,
}: SearchFilterBarProps) {
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  const hasAnyFilter = !!(conversationId || participantId || dateRangeStart || messageType);

  // Date range state for the calendar picker
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    dateRangeStart
      ? {
          from: new Date(dateRangeStart),
          to: dateRangeEnd ? new Date(dateRangeEnd) : undefined,
        }
      : undefined
  );

  function handleDateSelect(range: DateRange | undefined) {
    setDateRange(range);
    if (range?.from) {
      const start = range.from.getTime();
      const end = range.to ? range.to.getTime() + 86400000 - 1 : start + 86400000 - 1; // End of day
      onDateRangeChange(start, end);
    } else {
      onDateRangeChange(null, null);
    }
  }

  const nonMeParticipants = participants
    ? [...participants].filter((p) => !p.isMe).sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [];

  function getConversationLabel(conv: { title: string; participantNames: string[] }): string {
    if (conv.participantNames.length > 0) return conv.participantNames.join(", ");
    return conv.title.replace(/^Messages with\s+/i, "");
  }

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`
      : format(dateRange.from, "MMM d, yyyy")
    : "Date range";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Conversation filter */}
      <Select
        value={conversationId ?? "__all__"}
        onValueChange={(val) => onConversationChange(val === "__all__" ? null : val)}
      >
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="All conversations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">All conversations</SelectItem>
          {(conversations ?? []).map((conv) => (
            <SelectItem key={conv._id} value={conv._id} className="text-xs">
              {getConversationLabel(conv)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Participant filter */}
      <Select
        value={participantId ?? "__all__"}
        onValueChange={(val) => onParticipantChange(val === "__all__" ? null : val)}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="All people" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">All people</SelectItem>
          {nonMeParticipants.map((p) => (
            <SelectItem key={p._id} value={p._id} className="text-xs">
              {p.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Date range picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Message type filter */}
      <Select
        value={messageType ?? "__all__"}
        onValueChange={(val) => onMessageTypeChange(val === "__all__" ? null : val)}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">All types</SelectItem>
          <SelectItem value="text" className="text-xs">Text</SelectItem>
          <SelectItem value="image" className="text-xs">Images</SelectItem>
          <SelectItem value="video" className="text-xs">Videos</SelectItem>
          <SelectItem value="link" className="text-xs">Links</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear filters button */}
      {hasAnyFilter && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearAll}>
          <X className="mr-1 h-3 w-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
```

**Design notes:** Mirrors the `calendar-filters.tsx` pattern exactly — same `h-8` height, `text-xs` font size, same `Select` component usage, same clear button pattern. Date range uses `Popover` + `Calendar` with `mode="range"` and 2-month display.

#### Step 4: Create the search result card component

**File:** `/Users/robert.sawyer/Git/messagevault/components/search/search-result-card.tsx` (new file)

```typescript
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
    // Set the message ID in the browse store so the thread view highlights it
    setHighlightedMessageId(messageId);
    router.push(`/browse/${conversationId}`);
  }

  // Format the date header
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const bubbleColor = isMe ? "var(--color-bubble-me)" : avatarColor;
  const textColor = isMe ? "white" : "white";

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
        <span className="shrink-0">·</span>
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
            "rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed",
            isMe ? "max-w-[80%] rounded-br-lg" : "max-w-[85%] rounded-bl-lg"
          )}
          style={{ backgroundColor: bubbleColor, color: textColor }}
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
```

**Design notes:**
- **Card container**: `bg-card` (oklch 0.16) with `border-border`. On hover, the border shifts to `border-primary/40` (subtle blue glow) — signals clickability without being loud.
- **Match highlighting**: Search terms wrapped in `<mark>` with `bg-primary/30` (30% opacity blue) — visible but doesn't obscure text. Uses `text-inherit` so the highlight adapts to both light and dark text.
- **Context messages**: Rendered at `opacity-40` with smaller text (`text-[13px]`) and `line-clamp-2`. Provides conversational flow without competing with the matched message.
- **Matched bubble**: Renders in the same iMessage style as the browse view — right-aligned blue for "me", left-aligned with participant color for others. Uses `rounded-2xl` with the characteristic asymmetric corner.
- **Click-through**: Sets `highlightedMessageId` in the browse store before navigating. The browse view's `MessageThread` already watches this value (via `useBrowseStore`).

**Important note for executor:** The browse view (`message-thread.tsx`) already has `highlightedMessageId` in the store but doesn't yet implement scrolling to it or visual highlighting. The executor should add that behavior — scroll to the highlighted message and apply a brief pulse animation. This is a small enhancement to the existing `MessageThread` component:

```typescript
// In message-thread.tsx, add an effect after the scroll-to-date effect:
const highlightedMessageId = useBrowseStore((s) => s.highlightedMessageId);

useEffect(() => {
  if (!highlightedMessageId || rows.length === 0) return;

  const targetIndex = rows.findIndex(
    (row) => row.type === "message" && row.message._id === highlightedMessageId
  );

  if (targetIndex >= 0) {
    virtualizer.scrollToIndex(targetIndex, { align: "center" });
  }

  // Clear after scrolling (one-shot)
  const timer = setTimeout(() => setHighlightedMessageId(null), 3000);
  return () => clearTimeout(timer);
}, [highlightedMessageId, rows, virtualizer, setHighlightedMessageId]);
```

And in the render, add a highlight ring to the matched message:
```typescript
// In the MessageBubble wrapper div, add conditional styling:
const isHighlighted = row.type === "message" && row.message._id === highlightedMessageId;
// Add className: isHighlighted && "ring-2 ring-primary/50 rounded-2xl animate-pulse"
```

#### Step 5: Create the search results list component

**File:** `/Users/robert.sawyer/Git/messagevault/components/search/search-results.tsx` (new file)

```typescript
// ABOUTME: Search results list — renders result cards with stats bar.
// ABOUTME: Handles loading skeletons, empty states, and result count display.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SearchResultCard } from "./search-result-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Sparkles } from "lucide-react";
import { useMemo } from "react";

interface ContextMessage {
  _id: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface SearchResult {
  _id: string;
  conversationId: string;
  participantId: string;
  senderName: string;
  content: string;
  timestamp: number;
  dateKey: string;
  messageType: string;
  attachmentRef?: string;
  hasReactions: boolean;
  _score: number;
  contextBefore: ContextMessage[];
  contextAfter: ContextMessage[];
}

interface SearchResultsProps {
  results: SearchResult[];
  totalCount: number;
  conversationCounts: Record<string, number>;
  searchQuery: string;
  isSearching: boolean;
  hasSearched: boolean;
}

const SUGGESTION_CHIPS = [
  "birthday",
  "vacation",
  "dinner plans",
  "funny moments",
  "holiday",
  "miss you",
];

export function SearchResults({
  results,
  totalCount,
  conversationCounts,
  searchQuery,
  isSearching,
  hasSearched,
}: SearchResultsProps) {
  // Fetch conversations and participants for display name resolution
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  // Build lookup maps
  const conversationMap = useMemo(() => {
    const map = new Map<string, { title: string; participantNames: string[] }>();
    for (const conv of conversations ?? []) {
      map.set(conv._id, {
        title: conv.participantNames.length > 0
          ? conv.participantNames.join(", ")
          : conv.title.replace(/^Messages with\s+/i, ""),
        participantNames: conv.participantNames,
      });
    }
    return map;
  }, [conversations]);

  const participantMap = useMemo(() => {
    const map = new Map<string, { isMe: boolean; avatarColor: string }>();
    for (const p of participants ?? []) {
      map.set(p._id, { isMe: p.isMe, avatarColor: p.avatarColor });
    }
    return map;
  }, [participants]);

  const conversationCount = Object.keys(conversationCounts).length;

  // --- Loading state ---
  if (isSearching) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-4 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // --- Initial empty state (no search yet) ---
  if (!hasSearched) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
            <Search className="h-7 w-7 text-muted-foreground/70" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">
            Search your messages
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Find any message across all your conversations with keywords, semantic understanding, or both.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SUGGESTION_CHIPS.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- No results state ---
  if (results.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
            <Sparkles className="h-7 w-7 text-muted-foreground/70" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">
            No results found
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Try different keywords, broaden your filters, or switch to Hybrid mode for semantic matching.
          </p>
        </div>
      </div>
    );
  }

  // --- Results ---
  return (
    <div className="flex flex-col">
      {/* Stats bar */}
      <div className="border-b border-border px-6 py-2.5">
        <p className="text-sm text-muted-foreground">
          Found <span className="font-medium text-foreground">{totalCount}</span>{" "}
          result{totalCount !== 1 ? "s" : ""} in{" "}
          <span className="font-medium text-foreground">{conversationCount}</span>{" "}
          conversation{conversationCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Result cards */}
      <div className="space-y-3 p-6">
        {results.map((result) => {
          const conv = conversationMap.get(result.conversationId);
          const participant = participantMap.get(result.participantId);

          return (
            <SearchResultCard
              key={result._id}
              messageId={result._id}
              conversationId={result.conversationId}
              conversationTitle={conv?.title ?? "Unknown conversation"}
              senderName={result.senderName}
              content={result.content}
              timestamp={result.timestamp}
              dateKey={result.dateKey}
              isMe={participant?.isMe ?? false}
              avatarColor={participant?.avatarColor ?? "var(--color-bubble-other)"}
              searchQuery={searchQuery}
              contextBefore={result.contextBefore}
              contextAfter={result.contextAfter}
            />
          );
        })}
      </div>
    </div>
  );
}
```

#### Step 6: Rewrite the search page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/search/page.tsx` (complete rewrite)

```typescript
// ABOUTME: Search page — hybrid keyword + semantic search across all conversations.
// ABOUTME: Search input with debounce, mode toggle, filter bar, and click-through result cards.

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SearchModeToggle } from "@/components/search/search-mode-toggle";
import { SearchFilterBar } from "@/components/search/search-filter-bar";
import { SearchResults } from "@/components/search/search-results";
import { useSearchStore } from "@/lib/stores/use-search-store";
import type { Id } from "@/convex/_generated/dataModel";

type SearchMode = "keyword" | "semantic" | "hybrid";

export default function SearchPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    query,
    mode,
    filters,
    results,
    totalCount,
    conversationCounts,
    isSearching,
    hasSearched,
    setQuery,
    setMode,
    setFilter,
    clearFilters,
    setResults,
    setIsSearching,
  } = useSearchStore();

  const hybridSearch = useAction(api.search.hybridSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Sync URL params → store on mount ---
  useEffect(() => {
    const q = searchParams.get("q");
    const m = searchParams.get("mode") as SearchMode | null;
    const conv = searchParams.get("conversationId");
    const part = searchParams.get("participantId");

    if (q) setQuery(q);
    if (m && ["keyword", "semantic", "hybrid"].includes(m)) setMode(m);
    if (conv) setFilter("conversationId", conv);
    if (part) setFilter("participantId", part);
  }, []); // Only on mount

  // --- Sync store → URL params ---
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (mode !== "hybrid") params.set("mode", mode);
    if (filters.conversationId) params.set("conversationId", filters.conversationId);
    if (filters.participantId) params.set("participantId", filters.participantId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [query, mode, filters.conversationId, filters.participantId, pathname, router]);

  // --- Execute search ---
  const executeSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([], 0, {});
      return;
    }

    setIsSearching(true);
    try {
      const response = await hybridSearch({
        searchQuery: trimmed,
        mode,
        conversationId: filters.conversationId
          ? (filters.conversationId as Id<"conversations">)
          : undefined,
        participantId: filters.participantId
          ? (filters.participantId as Id<"participants">)
          : undefined,
        dateRangeStart: filters.dateRangeStart ?? undefined,
        dateRangeEnd: filters.dateRangeEnd ?? undefined,
        limit: 50,
      });

      // Post-filter by message type on the client (not supported by backend)
      let filtered = response.results;
      if (filters.messageType) {
        filtered = filtered.filter((r: any) => r.messageType === filters.messageType);
      }

      setResults(filtered, response.totalCount, response.conversationCounts);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([], 0, {});
    } finally {
      setIsSearching(false);
    }
  }, [query, mode, filters, hybridSearch, setResults, setIsSearching]);

  // --- Debounced search trigger ---
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      // Don't search on empty, but update URL
      syncUrl();
      return;
    }

    debounceRef.current = setTimeout(() => {
      executeSearch();
      syncUrl();
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode, filters, executeSearch, syncUrl]);

  // --- Handlers ---
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
  }

  function handleClearQuery() {
    setQuery("");
    setResults([], 0, {});
    inputRef.current?.focus();
  }

  function handleModeChange(newMode: SearchMode) {
    setMode(newMode);
  }

  function handleClearAllFilters() {
    clearFilters();
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Search" description="Find messages across all conversations" />

      <div className="border-b border-border px-6 py-4 space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search your messages..."
            value={query}
            onChange={handleQueryChange}
            className="h-11 pl-10 pr-10 text-sm"
            autoFocus
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0"
              onClick={handleClearQuery}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Mode toggle + filters row */}
        <div className="flex flex-wrap items-center gap-3">
          <SearchModeToggle value={mode} onChange={handleModeChange} />
          <div className="h-5 w-px bg-border" /> {/* Vertical divider */}
          <SearchFilterBar
            conversationId={filters.conversationId}
            participantId={filters.participantId}
            dateRangeStart={filters.dateRangeStart}
            dateRangeEnd={filters.dateRangeEnd}
            messageType={filters.messageType}
            onConversationChange={(id) => setFilter("conversationId", id)}
            onParticipantChange={(id) => setFilter("participantId", id)}
            onDateRangeChange={(start, end) => {
              setFilter("dateRangeStart", start);
              setFilter("dateRangeEnd", end);
            }}
            onMessageTypeChange={(type) => setFilter("messageType", type as any)}
            onClearAll={handleClearAllFilters}
          />
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        <SearchResults
          results={results}
          totalCount={totalCount}
          conversationCounts={conversationCounts}
          searchQuery={query}
          isSearching={isSearching}
          hasSearched={hasSearched}
        />
      </div>
    </div>
  );
}
```

#### Step 7: Add highlight scroll behavior to the browse view

**File:** `/Users/robert.sawyer/Git/messagevault/components/browse/message-thread.tsx`

Add a `useEffect` for handling search-to-browse highlight navigation. Insert after the existing `scrollToDateKey` effect (around line 287):

```typescript
// E4: Scroll to and highlight a message from search click-through
const highlightedMessageId = useBrowseStore((s) => s.highlightedMessageId);
const setHighlightedMessageId = useBrowseStore((s) => s.setHighlightedMessageId);

useEffect(() => {
  if (!highlightedMessageId || rows.length === 0 || status !== "Exhausted") return;

  const targetIndex = rows.findIndex(
    (row) => row.type === "message" && row.message._id === highlightedMessageId
  );

  if (targetIndex >= 0) {
    virtualizer.scrollToIndex(targetIndex, { align: "center" });
  }

  // Auto-clear highlight after 3 seconds
  const timer = setTimeout(() => setHighlightedMessageId(null), 3000);
  return () => clearTimeout(timer);
}, [highlightedMessageId, rows, status, virtualizer, setHighlightedMessageId]);
```

And in the render section, add a highlight ring to the matching message. In the virtualizer row render (around line 335), wrap the `MessageBubble` with conditional highlight styling:

```typescript
{row.type === "message" && (
  <div
    className={cn(
      "transition-all duration-500",
      row.message._id === highlightedMessageId &&
        "rounded-2xl ring-2 ring-primary/50 bg-primary/5"
    )}
  >
    <MessageBubble ... />
  </div>
)}
```

**Note:** The `highlightedMessageId` is already destructured from `useBrowseStore` earlier in the component — the executor just needs to add it to the destructuring if not already there, plus add `setHighlightedMessageId` which isn't currently destructured.

**How to verify:** Search for a message, click a result, and confirm the browse view opens scrolled to that message with a brief blue ring highlight that fades after 3 seconds.

---

### 4. Testing Strategy

**Browser verification (required):**

1. **Search input**: Navigate to `/search`. Input should be auto-focused. Type "hello" — after 300ms pause, results should appear. Clear the input — results should clear.

2. **Mode toggle**: Switch between Keyword, Semantic, and Hybrid. Each mode should re-execute the search with visibly different result rankings. Keyword should show exact matches first. Semantic should show conceptually related messages. Hybrid should blend both.

3. **Filter bar**: Select a conversation — results should be scoped. Select a participant — results should be from that person. Set a date range — results should fall within it. Clear filters — all results return.

4. **Result cards**: Each card should show conversation name, date, context messages (dimmed), and the matched message (full bubble style). Match terms should be highlighted with blue background.

5. **Click-through**: Click a result card — should navigate to `/browse/[conversationId]` with the matched message scrolled into view and highlighted.

6. **Empty states**: No query → "Search your messages" with suggestion chips. Query with no results → "No results found" with suggestions. Loading → skeleton cards.

7. **URL persistence**: Search for "birthday" → URL should update to `?q=birthday`. Refresh page → search should re-execute with "birthday".

8. **Responsive**: Resize to mobile width — filter bar should wrap, cards should remain readable.

**Edge case testing:**
- Very long messages in search results (should truncate or wrap cleanly)
- Messages with special characters in content
- Search immediately after import (before embeddings complete) — semantic mode should return fewer results
- Rapid typing (debounce should prevent excessive API calls)

---

### 5. Validation Checklist

- [ ] Search page renders at `/search` (no more placeholder)
- [ ] Search input has 300ms debounce
- [ ] Auto-focus on page load
- [ ] Clear button appears when input has text
- [ ] Mode toggle renders all three options (Keyword, Semantic, Hybrid)
- [ ] Hybrid is the default mode
- [ ] Mode toggle re-triggers search
- [ ] Conversation filter works
- [ ] Participant filter works
- [ ] Date range picker works
- [ ] Message type filter works
- [ ] Clear filters button appears when any filter is active
- [ ] Results display as styled cards with context messages
- [ ] Match terms are highlighted in result content
- [ ] Stats bar shows result count and conversation count
- [ ] Click result navigates to browse view
- [ ] Browse view scrolls to and highlights the clicked message
- [ ] Highlight ring fades after ~3 seconds
- [ ] Empty state (no query) shows suggestion chips
- [ ] Empty state (no results) shows helpful message
- [ ] Loading state shows skeleton cards
- [ ] URL updates with search params (q, mode, filters)
- [ ] Page refresh restores search from URL params
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] ABOUTME comments on all new files
- [ ] Zustand store doesn't use inline arrow selectors (React Compiler safe)

---

### 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| `useAction` not available for `hybridSearch` | TypeScript error or runtime "not a function" | Ensure `convex/search.ts` exports `hybridSearch` as a public `action` (not `internalAction`). Verify it appears in `convex/_generated/api.d.ts` after running `pnpm convex dev`. |
| Convex `useAction` vs `useQuery` | Actions are one-shot, not reactive | This is correct — search is triggered by user action, not reactively. `useAction` returns a function to call imperatively. |
| Date range calendar not working | Calendar component doesn't support range mode | Verify `react-day-picker` is installed (it is — `^9.14.0`) and the shadcn `Calendar` component supports `mode="range"`. Check if the Calendar component needs to be regenerated with `pnpm dlx shadcn@latest add calendar`. |
| React Compiler + Zustand selectors | Stale closures or re-render loops | The store is consumed via `useSearchStore()` which returns the full state. For performance, components can use `useSearchStore((s) => s.query)` with named function selectors. The skill's approach is safe because `create()` stores action functions are stable references. |
| `hybridSearch` action API not matching | Type errors on action args | Verify the E3 `hybridSearch` action args match what the page sends. Especially the `mode` union type and optional filter args. |
| Message type filter not in backend | Backend doesn't filter by `messageType` | The page applies message type filtering client-side after receiving results. This is acceptable at the current scale (50 results max). |
| `highlightedMessageId` not consumed in browse view | Click-through navigates but doesn't scroll/highlight | The browse store already has this field (confirmed in `use-browse-store.ts`). The executor must add the scroll effect to `message-thread.tsx` as described in Step 7. |

---

### 7. Assumptions & Dependencies

**Must be true before execution:**
- E3 (hybrid search) is fully implemented — `search:hybridSearch` action is available
- Convex dev environment is running (`pnpm convex dev`)
- Messages are imported with data available for search
- All shadcn components are installed: `input`, `select`, `button`, `popover`, `calendar`, `skeleton`, `badge`
- `date-fns` is installed (confirmed: `^4.1.0`)
- `react-day-picker` is installed (confirmed: `^9.14.0`)

**New files created (5):**
1. `lib/stores/use-search-store.ts` — Zustand search state
2. `components/search/search-mode-toggle.tsx` — Segmented control
3. `components/search/search-filter-bar.tsx` — Filter dropdowns + date picker
4. `components/search/search-result-card.tsx` — Individual result card
5. `components/search/search-results.tsx` — Results list + stats + empty states

**Files modified (2):**
1. `app/(app)/search/page.tsx` — Complete rewrite from placeholder
2. `components/browse/message-thread.tsx` — Add highlight scroll behavior

**No new packages needed** — everything is already installed.

**Component organization:** New components go in `components/search/` following the existing feature-based organization pattern (`components/browse/`, `components/calendar/`, `components/import/`).
