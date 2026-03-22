# D2 — Calendar Filters

### 1. Problem Summary

**What:** Add conversation and participant filter controls to the calendar heatmap, allowing users to view message activity for a specific conversation or person rather than the aggregate.

**Why:** The aggregate heatmap shows overall activity, but users want to answer questions like "When did Mom and I text most?" or "What months was the family group chat most active?" Filters transform the heatmap from a summary into an exploration tool.

**Success Criteria:**
- Conversation filter dropdown populated from user's conversation list
- Participant filter dropdown populated from user's participant list
- Selecting a filter updates the heatmap in real-time (no re-query needed — client-side filtering)
- Active filters visually indicated
- Clear filter button resets to "all"
- Filter state persisted in URL query parameters
- Heatmap intensity recalculated based on filtered counts

---

### 2. Current State Analysis

**Existing files to modify:**
- `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/page.tsx` — Calendar page (created in D1). Will add filter bar.
- `/Users/robert.sawyer/Git/messagevault/components/calendar/calendar-heatmap.tsx` — (Created in D1). Already has `filterFn` prop designed for this.

**Existing files to reference:**
- `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` — `list` query returns all conversations with participant names. Already exists.
- `/Users/robert.sawyer/Git/messagevault/convex/participants.ts` — `list` query returns all participants. Already exists.
- `/Users/robert.sawyer/Git/messagevault/components/browse/participant-filter.tsx` — Existing participant filter from browse view (C4). Reference for pattern, but calendar filters need a different UX (dropdown selects vs. toggle chips).
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` (lines 112-128) — `dailyStats.conversationBreakdown` and `participantBreakdown` arrays enable client-side filtering.

**Missing shadcn/ui component:**
- No `components/ui/select.tsx` exists. Need to add the shadcn Select component for dropdown menus. Run: `pnpm dlx shadcn@latest add select`

**Data model for filtering:**
Each `dailyStats` record contains:
```typescript
{
  totalMessages: number,
  conversationBreakdown: [{ conversationId, count }],
  participantBreakdown: [{ participantId, count }],
}
```
When filtering by conversation: sum the `count` from `conversationBreakdown` entries matching the selected conversation(s).
When filtering by participant: sum the `count` from `participantBreakdown` entries matching the selected participant(s).

---

### 3. Detailed Step-by-Step Implementation

#### Step 1: Install shadcn Select component

**Command:**
```bash
pnpm dlx shadcn@latest add select
```

This creates `/Users/robert.sawyer/Git/messagevault/components/ui/select.tsx`.

**Verify:** File exists and exports `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`.

---

#### Step 2: Create the CalendarFilters component

**File:** `/Users/robert.sawyer/Git/messagevault/components/calendar/calendar-filters.tsx` (NEW)

```typescript
// ABOUTME: Filter controls for the calendar heatmap — conversation and participant dropdowns.
// ABOUTME: Filters use dailyStats breakdown arrays for client-side recomputation (no re-query).

"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const ALL_VALUE = "__all__";

export interface CalendarFilterState {
  conversationId: string | null;
  participantId: string | null;
}

/**
 * Read current filter state from URL search params.
 */
export function useCalendarFilters(): CalendarFilterState {
  const searchParams = useSearchParams();
  return {
    conversationId: searchParams.get("conversation"),
    participantId: searchParams.get("participant"),
  };
}

export function CalendarFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useCalendarFilters();

  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  const isFiltered = filters.conversationId || filters.participantId;

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== ALL_VALUE) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  // Non-me participants sorted by name
  const sortedParticipants = useMemo(() => {
    if (!participants) return [];
    return [...participants]
      .filter((p) => !p.isMe)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [participants]);

  // Conversations sorted by most recent
  const sortedConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations; // Already sorted by dateRange.end desc from query
  }, [conversations]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Conversation filter */}
      <Select
        value={filters.conversationId ?? ALL_VALUE}
        onValueChange={(v) => updateFilter("conversation", v)}
      >
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="All conversations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All conversations</SelectItem>
          {sortedConversations.map((conv) => (
            <SelectItem key={conv._id} value={conv._id}>
              {conv.participantNames.join(", ") ||
                conv.title.replace("Messages with ", "")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Participant filter */}
      <Select
        value={filters.participantId ?? ALL_VALUE}
        onValueChange={(v) => updateFilter("participant", v)}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="All participants" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All participants</SelectItem>
          {sortedParticipants.map((p) => (
            <SelectItem key={p._id} value={p._id}>
              {p.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Active filter indicator + clear */}
      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={clearFilters}
        >
          <X className="h-3 w-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
```

**Design rationale:**
- Select dropdowns are compact (h-8, text-xs) to avoid dominating the page above the heatmap
- URL-based filter state means filters survive page reloads and can be bookmarked
- `__all__` sentinel value avoids empty-string issues with Select components
- "Clear filters" only appears when filters are active, with a subtle X icon
- Conversations use `participantNames` for display (consistent with sidebar)
- Participant list excludes "me" — filtering by yourself is rarely useful

**Verify:** Dropdowns populate from Convex data. Selecting a filter updates URL params. Clear button removes all params.

---

#### Step 3: Create the filter function builder

**File:** `/Users/robert.sawyer/Git/messagevault/lib/calendar-filter.ts` (NEW)

```typescript
// ABOUTME: Builds a filter function for the calendar heatmap from URL-based filter state.
// ABOUTME: Recomputes message counts from dailyStats breakdown arrays without re-querying.

import type { CalendarFilterState } from "@/components/calendar/calendar-filters";

interface DailyStatBreakdown {
  totalMessages: number;
  conversationBreakdown: { conversationId: string; count: number }[];
  participantBreakdown: { participantId: string; count: number }[];
}

/**
 * Build a filter function from the current filter state.
 * Returns null if no filters are active (use totalMessages directly).
 * When filters are active, computes the filtered count from breakdown arrays.
 */
export function buildCalendarFilterFn(
  filters: CalendarFilterState
): ((stat: DailyStatBreakdown) => number) | undefined {
  const { conversationId, participantId } = filters;

  // No filters — return undefined to use totalMessages
  if (!conversationId && !participantId) return undefined;

  return (stat: DailyStatBreakdown) => {
    let count = stat.totalMessages;

    if (conversationId) {
      const entry = stat.conversationBreakdown.find(
        (b) => b.conversationId === conversationId
      );
      count = entry?.count ?? 0;
    }

    if (participantId) {
      const entry = stat.participantBreakdown.find(
        (b) => b.participantId === participantId
      );
      // When both filters active, take the minimum
      // (we can't know the intersection from the breakdowns alone)
      const pCount = entry?.count ?? 0;
      count = Math.min(count, pCount);
    }

    return count;
  };
}
```

**Why:** Separated from the component so the logic is testable and the component stays clean. The filter function is passed as a prop to `CalendarHeatmap` (which already accepts `filterFn` from D1).

**Edge case — Combined filters:** When both conversation AND participant filters are active, we can't compute the exact intersection from the separate breakdown arrays (we'd need a cross-tabulation). Using `Math.min()` gives a conservative upper bound. This is an acceptable approximation for a family app — exact cross-filtered counts would require additional data structures. Document this limitation.

**Verify:** Create a test scenario: filter by a conversation, confirm only that conversation's messages appear in the heatmap. Filter by a participant, confirm similar behavior.

---

#### Step 4: Update the calendar page to integrate filters

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/page.tsx`

Modify the page component from D1 to include the filter bar and pass the filter function:

```typescript
// ABOUTME: Calendar heatmap page — GitHub-style visualization of message activity over time.
// ABOUTME: Includes year navigation and conversation/participant filters.

"use client";

import { Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarHeatmap } from "@/components/calendar/calendar-heatmap";
import { YearSelector } from "@/components/calendar/year-selector";
import {
  CalendarFilters,
  useCalendarFilters,
} from "@/components/calendar/calendar-filters";
import { buildCalendarFilterFn } from "@/lib/calendar-filter";

function CalendarContent() {
  const filters = useCalendarFilters();
  const filterFn = buildCalendarFilterFn(filters);

  return <CalendarHeatmap filterFn={filterFn} />;
}

export default function CalendarPage() {
  const dateRange = useQuery(api.dailyStats.getDateRange);

  if (dateRange === undefined) {
    return (
      <div>
        <PageHeader title="Calendar" description="Message activity over time" />
        <div className="flex h-[300px] items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (dateRange === null) {
    return (
      <EmptyState
        icon={Calendar}
        title="Calendar"
        description="A heatmap of your messaging activity will appear here once you've imported conversations."
        action={{ label: "Import conversations", href: "/import" }}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Calendar" description="Message activity over time">
        <YearSelector />
      </PageHeader>
      <div className="space-y-4 p-6">
        <Suspense>
          <CalendarFilters />
          <CalendarContent />
        </Suspense>
      </div>
    </div>
  );
}
```

**Why `Suspense`:** `useSearchParams()` in `CalendarFilters` requires a Suspense boundary in Next.js App Router to avoid hydration issues.

**Verify:** Filters appear above heatmap. Selecting a conversation updates heatmap colors. Selecting a participant updates heatmap. Clearing filters restores full view.

---

### 4. Testing Strategy

**Type-check:**
```bash
pnpm build  # (with dev server stopped)
```

**Manual browser tests:**
1. Select a conversation filter — verify heatmap intensity changes to reflect only that conversation
2. Select a participant filter — verify similar behavior
3. Apply both filters — verify conservative count behavior
4. Clear filters — verify heatmap returns to aggregate view
5. Refresh the page with filter in URL — verify filter persists
6. Copy URL and open in new tab — verify filter state loads correctly

---

### 5. Validation Checklist

- [ ] shadcn Select component installed (`components/ui/select.tsx` exists)
- [ ] `components/calendar/calendar-filters.tsx` renders conversation and participant dropdowns
- [ ] `lib/calendar-filter.ts` builds filter functions from URL state
- [ ] Filter dropdowns populate with data from Convex queries
- [ ] Selecting a filter updates URL search params
- [ ] Heatmap intensity updates reactively when filters change
- [ ] Clear filters button appears when filters are active
- [ ] Page wrapped in `<Suspense>` for `useSearchParams` compatibility
- [ ] Combined conversation + participant filter works (conservative count)
- [ ] No TypeScript errors
- [ ] Every new file starts with two `ABOUTME:` comment lines

---

### 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| `useSearchParams` causes hydration mismatch | Next.js console warning | Wrap filter components in `<Suspense>`. Already included in plan. |
| Combined filters give misleading counts | Compare filtered count to actual cross-query | Document the `Math.min()` approximation. For a family app with 2-3 users this is acceptable. |
| Select dropdown shows Convex IDs instead of names | Visual inspection | Conversation list query already resolves participant names. Verify display text. |
| Filter state lost on year change | Switch years with filter active | URL params are independent of year — should persist. Verify. |
| Select component styling doesn't match dark theme | Visual inspection | shadcn Select inherits theme variables. Should work out of the box. |

---

### 7. Assumptions & Dependencies

**Must be true before execution:**
- D1 is complete (calendar heatmap exists with `filterFn` prop)
- Convex dev environment is running

**Dependencies:**
- `api.conversations.list` — already exists
- `api.participants.list` — already exists
- shadcn Select component — needs to be installed (Step 1)

**Decisions for executor:**
- **Multi-select vs single-select:** The plan uses single-select for both filters (one conversation OR one participant at a time). If multi-select is desired (e.g., "show activity for Mom AND Dad"), the executor would need to use a different UI pattern (combobox with chips). Recommend starting with single-select for simplicity.

---
---
