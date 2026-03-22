# D1 — Calendar Heatmap Component

### 1. Problem Summary

**What:** Build a GitHub-contribution-style calendar heatmap showing message activity across a full year, driven by the pre-aggregated `dailyStats` table.

**Why:** Users have thousands of messages spanning years. The heatmap provides an instant visual summary of messaging patterns — when they were most active, seasonal trends, quiet periods — without reading a single message. It's the primary entry point for time-based exploration.

**Success Criteria:**
- Heatmap renders a full 52×7 grid for any year with imported data
- Color intensity correctly maps to 5 message count thresholds (0, 1-5, 6-20, 21-50, 51+)
- Hover tooltips show date, message count, and active participants
- Year selector navigates between years
- Month labels and day-of-week labels orient the user
- Color legend explains intensity levels
- Empty state shown when no data exists for selected year
- Grid scales responsively within the main content area

---

### 2. Current State Analysis

**Existing files:**
- `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/page.tsx` — Placeholder page using `EmptyState` component. Will be replaced entirely.
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` (lines 112-128) — `dailyStats` table with `by_userId_dateKey` compound index. Fields: `userId`, `dateKey` (ISO string), `totalMessages`, `conversationBreakdown`, `participantBreakdown`.
- `/Users/robert.sawyer/Git/messagevault/convex/import.ts` (lines 426-486) — Import pipeline already upserts `dailyStats` records during import (stage 6). Data is available.
- **No `convex/dailyStats.ts` file exists** — backend queries must be created from scratch.
- **No `components/calendar/` directory exists** — all calendar components are new.

**Existing patterns to follow:**
- `components/shared/page-header.tsx` — Reusable page header with title, description, action slot. Use for calendar page header.
- `components/shared/empty-state.tsx` — Shown when no data. Reuse for empty calendar state.
- `components/ui/tooltip.tsx` — shadcn Tooltip. Use for cell hover tooltips.
- `app/globals.css` — All theme colors use oklch. New heatmap colors go in the `@theme {}` block.
- `lib/date-utils.ts` — Date formatting utilities. `fromDateKey()`, `formatDayHeader()` are reusable.
- `convex/lib/auth.ts` — `getUserId(ctx)` pattern used in every Convex query.
- `convex/conversations.ts` — Reference for query structure and auth pattern.

**Design tokens (from `globals.css`):**
- Background: `oklch(0.13 0.01 260)` — very dark blue-gray
- Muted: `oklch(0.22 0.01 260)` — cells with no messages should be just barely visible against this
- Card: `oklch(0.16 0.01 260)` — containers
- Border: `oklch(0.28 0.01 260)`
- Primary: `oklch(0.65 0.2 250)` — blue, used for interactive elements

---

### 3. Detailed Step-by-Step Implementation

#### Step 1: Add heatmap color variables to `globals.css`

**File:** `/Users/robert.sawyer/Git/messagevault/app/globals.css`

Add 5 heatmap intensity variables inside the existing `@theme {}` block, after the radius variables (line 63) and before the font variables (line 65):

```css
  --color-heatmap-empty: oklch(0.18 0.005 260);
  --color-heatmap-level-1: oklch(0.28 0.08 155);
  --color-heatmap-level-2: oklch(0.38 0.12 155);
  --color-heatmap-level-3: oklch(0.48 0.14 155);
  --color-heatmap-level-4: oklch(0.58 0.16 155);
```

**Design rationale:** These use a green hue (155 in oklch) reminiscent of GitHub's contribution graph, calibrated for the dark background. The empty state (`0.18` lightness) is barely visible — just enough to show the grid structure without competing with filled cells. Each level increases both lightness and chroma (saturation), creating a satisfying visual ramp from muted to vivid.

**Why:** Theme variables ensure consistency and future theming support. The heatmap colors are semantically distinct from participant colors (hue 155 vs hues 10-340).

**Verify:** Open `globals.css` and confirm the variables are syntactically correct inside `@theme {}`.

---

#### Step 2: Create `convex/dailyStats.ts` — backend queries

**File:** `/Users/robert.sawyer/Git/messagevault/convex/dailyStats.ts` (NEW)

```typescript
// ABOUTME: Daily stats queries — fetches pre-aggregated message counts by date.
// ABOUTME: Powers the calendar heatmap with O(365) queries per year.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Fetch all daily stats for a given year.
 * Uses the compound index on [userId, dateKey] with range filter.
 * Returns at most 366 records (leap year).
 */
export const listByYear = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const startKey = `${args.year}-01-01`;
    const endKey = `${args.year}-12-31`;

    return await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q
          .eq("userId", userId as any)
          .gte("dateKey", startKey)
          .lte("dateKey", endKey)
      )
      .collect();
  },
});

/**
 * Get the year range (earliest and latest dateKeys) for the current user.
 * Used to populate the year selector with valid years.
 */
export const getDateRange = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    // Get the earliest record
    const earliest = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any)
      )
      .first();

    if (!earliest) return null;

    // Get the latest record by collecting and sorting
    // (Convex doesn't support .order("desc") on index range queries easily,
    //  but we can collect all and take the last — at most a few thousand records)
    const all = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any)
      )
      .collect();

    const latest = all[all.length - 1];
    if (!latest) return null;

    return {
      earliestYear: parseInt(earliest.dateKey.substring(0, 4)),
      latestYear: parseInt(latest.dateKey.substring(0, 4)),
    };
  },
});
```

**Why:** The heatmap needs all daily stats for a selected year. The `by_userId_dateKey` compound index supports efficient range queries. `getDateRange` tells the year selector which years have data.

**Edge case:** `getDateRange` fetches all records to find the latest. This is at most ~3,650 records for 10 years of data — well within Convex limits. If performance is a concern, an alternative is to use the `conversations` table's `dateRange` fields.

**Verify:** Run `pnpm convex dev` and confirm no schema/type errors. Test with a Convex dashboard query.

---

#### Step 3: Create the Zustand calendar store

**File:** `/Users/robert.sawyer/Git/messagevault/lib/stores/use-calendar-store.ts` (NEW)

```typescript
// ABOUTME: Zustand store for calendar view UI state — selected year and view preferences.
// ABOUTME: Ephemeral state only; filter state lives in URL search params (see D2).

import { create } from "zustand";

interface CalendarState {
  /** Currently selected year for the heatmap */
  selectedYear: number;
}

interface CalendarActions {
  setSelectedYear: (year: number) => void;
}

export type CalendarStore = CalendarState & CalendarActions;

export const useCalendarStore = create<CalendarStore>((set) => ({
  selectedYear: new Date().getFullYear(),
  setSelectedYear: (year) => set({ selectedYear: year }),
}));
```

**Why:** Year selection is ephemeral UI state — no need to persist to Convex or URL. Follows the same pattern as `use-sidebar-store.ts` and `use-browse-store.ts`.

**Verify:** TypeScript compiles clean.

---

#### Step 4: Create the calendar heatmap grid utility

**File:** `/Users/robert.sawyer/Git/messagevault/lib/calendar-utils.ts` (NEW)

```typescript
// ABOUTME: Calendar heatmap grid computation — builds the 52×7 cell matrix from daily stats.
// ABOUTME: Pure functions for grid layout, intensity levels, and date arithmetic.

/**
 * Intensity levels for the heatmap. Each level maps to a CSS variable.
 */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

/**
 * A single cell in the heatmap grid.
 */
export interface HeatmapCell {
  /** ISO date key "2023-01-15" */
  dateKey: string;
  /** Day of month (1-31) */
  day: number;
  /** Total message count */
  count: number;
  /** Intensity level for coloring */
  level: HeatmapLevel;
}

/**
 * Map a message count to a heatmap intensity level.
 * Thresholds from spec: 0, 1-5, 6-20, 21-50, 51+
 */
export function getHeatmapLevel(count: number): HeatmapLevel {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 20) return 2;
  if (count <= 50) return 3;
  return 4;
}

/**
 * CSS variable name for a heatmap level.
 */
export function getHeatmapColor(level: HeatmapLevel): string {
  if (level === 0) return "var(--color-heatmap-empty)";
  return `var(--color-heatmap-level-${level})`;
}

/**
 * Build the full heatmap grid for a given year.
 * Returns a 2D array: grid[column (week)][row (day of week, 0=Sun)].
 *
 * The grid starts on the first Sunday on or before Jan 1,
 * and ends on the last Saturday on or after Dec 31.
 * This matches GitHub's contribution graph layout.
 */
export function buildHeatmapGrid(
  year: number,
  statsMap: Map<string, number>
): (HeatmapCell | null)[][] {
  // Find the first day of the year
  const jan1 = new Date(year, 0, 1);
  // Walk back to the preceding Sunday (day 0)
  const startDate = new Date(jan1);
  startDate.setDate(jan1.getDate() - jan1.getDay());

  // Find the last day of the year
  const dec31 = new Date(year, 11, 31);
  // Walk forward to the following Saturday (day 6)
  const endDate = new Date(dec31);
  endDate.setDate(dec31.getDate() + (6 - dec31.getDay()));

  const grid: (HeatmapCell | null)[][] = [];
  let currentDate = new Date(startDate);
  let currentWeek: (HeatmapCell | null)[] = [];

  while (currentDate <= endDate) {
    const dateKey = formatDateKey(currentDate);
    const isInYear = currentDate.getFullYear() === year;

    if (isInYear) {
      const count = statsMap.get(dateKey) ?? 0;
      currentWeek.push({
        dateKey,
        day: currentDate.getDate(),
        count,
        level: getHeatmapLevel(count),
      });
    } else {
      currentWeek.push(null); // Outside the target year
    }

    // End of week (Saturday)
    if (currentDate.getDay() === 6) {
      grid.push(currentWeek);
      currentWeek = [];
    }

    currentDate = new Date(currentDate);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Push any remaining partial week
  if (currentWeek.length > 0) {
    grid.push(currentWeek);
  }

  return grid;
}

/**
 * Get month labels with their starting column index.
 * Used to render month labels above the grid.
 */
export function getMonthLabels(year: number): { label: string; col: number }[] {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const jan1 = new Date(year, 0, 1);
  const startDate = new Date(jan1);
  startDate.setDate(jan1.getDate() - jan1.getDay());

  return months.map((label, monthIndex) => {
    const firstOfMonth = new Date(year, monthIndex, 1);
    // Calculate which column (week) this month starts in
    const daysSinceStart = Math.floor(
      (firstOfMonth.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const col = Math.floor(daysSinceStart / 7);
    return { label, col };
  });
}

/**
 * Format a Date as an ISO date key "2023-01-15".
 */
function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Threshold labels for the legend.
 */
export const HEATMAP_THRESHOLDS = [
  { level: 0 as HeatmapLevel, label: "No messages" },
  { level: 1 as HeatmapLevel, label: "1-5" },
  { level: 2 as HeatmapLevel, label: "6-20" },
  { level: 3 as HeatmapLevel, label: "21-50" },
  { level: 4 as HeatmapLevel, label: "51+" },
] as const;
```

**Why:** Separating grid computation from rendering keeps the React component clean and makes the logic independently testable. The grid structure matches GitHub's layout (Sunday-start weeks, grid aligned to week boundaries).

**Verify:** The `buildHeatmapGrid` function should produce 52-54 columns and exactly 7 rows per column. Test with edge cases: leap year, year starting on Sunday, year starting on Saturday.

---

#### Step 5: Create the CalendarHeatmap component

**File:** `/Users/robert.sawyer/Git/messagevault/components/calendar/calendar-heatmap.tsx` (NEW)

This is the main heatmap component. Key design decisions:

```typescript
// ABOUTME: GitHub-style calendar heatmap showing message activity by day across a year.
// ABOUTME: Reads pre-aggregated dailyStats for O(365) rendering performance.

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildHeatmapGrid,
  getHeatmapColor,
  getMonthLabels,
  HEATMAP_THRESHOLDS,
  type HeatmapCell,
} from "@/lib/calendar-utils";
import { useCalendarStore } from "@/lib/stores/use-calendar-store";
import { fromDateKey } from "@/lib/date-utils";

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;
const CELL_SIZE = 13; // px — GitHub uses ~13px
const CELL_GAP = 3; // px gap between cells

interface CalendarHeatmapProps {
  /** Optional filter function applied to dailyStats before rendering.
   *  Takes totalMessages and breakdowns, returns filtered count.
   *  Used by D2 calendar filters. */
  filterFn?: (stat: {
    totalMessages: number;
    conversationBreakdown: { conversationId: string; count: number }[];
    participantBreakdown: { participantId: string; count: number }[];
  }) => number;
}

export function CalendarHeatmap({ filterFn }: CalendarHeatmapProps) {
  const router = useRouter();
  const { selectedYear } = useCalendarStore();

  // Fetch daily stats for the selected year
  const stats = useQuery(api.dailyStats.listByYear, { year: selectedYear });

  // Build lookup map: dateKey -> message count (applying filter if present)
  const statsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!stats) return map;
    for (const stat of stats) {
      const count = filterFn ? filterFn(stat as any) : stat.totalMessages;
      map.set(stat.dateKey, count);
    }
    return map;
  }, [stats, filterFn]);

  // Build participant info for tooltips
  const participantTooltips = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!stats) return map;
    for (const stat of stats) {
      // Just store participant count for now — full names resolved in D2
      map.set(stat.dateKey, [`${stat.participantBreakdown.length} participants`]);
    }
    return map;
  }, [stats]);

  // Build grid
  const grid = useMemo(
    () => buildHeatmapGrid(selectedYear, statsMap),
    [selectedYear, statsMap]
  );

  // Month labels
  const monthLabels = useMemo(
    () => getMonthLabels(selectedYear),
    [selectedYear]
  );

  // Loading state
  if (stats === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-[120px] w-full" />
      </div>
    );
  }

  const handleCellClick = (cell: HeatmapCell) => {
    if (cell.count > 0) {
      router.push(`/calendar/${cell.dateKey}`);
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-3">
        {/* Month labels row */}
        <div
          className="flex text-[10px] text-muted-foreground"
          style={{ paddingLeft: 32 }} // offset for day labels
        >
          {monthLabels.map((month, i) => (
            <div
              key={month.label}
              className="shrink-0"
              style={{
                // Position each label at its column offset
                position: i === 0 ? "relative" : "absolute",
                left: i === 0 ? 0 : month.col * (CELL_SIZE + CELL_GAP),
              }}
            >
              {month.label}
            </div>
          ))}
        </div>

        {/* Grid container */}
        <div className="flex gap-0.5">
          {/* Day-of-week labels */}
          <div
            className="flex flex-col justify-between text-[10px] text-muted-foreground"
            style={{ width: 28, height: 7 * (CELL_SIZE + CELL_GAP) - CELL_GAP }}
          >
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                className="flex items-center"
                style={{ height: CELL_SIZE }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Heatmap grid — columns are weeks, rows are days */}
          <div className="flex gap-[3px] overflow-x-auto">
            {grid.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[3px]">
                {week.map((cell, dayIndex) => {
                  if (!cell) {
                    return (
                      <div
                        key={dayIndex}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                        }}
                      />
                    );
                  }

                  const color = getHeatmapColor(cell.level);
                  const date = fromDateKey(cell.dateKey);
                  const formattedDate = date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <Tooltip key={dayIndex}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rounded-[2px] transition-all hover:ring-1 hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          style={{
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            backgroundColor: color,
                            cursor: cell.count > 0 ? "pointer" : "default",
                          }}
                          onClick={() => handleCellClick(cell)}
                          aria-label={`${formattedDate}: ${cell.count} messages`}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="text-xs"
                      >
                        <p className="font-medium">{formattedDate}</p>
                        <p className="text-muted-foreground">
                          {cell.count === 0
                            ? "No messages"
                            : `${cell.count.toLocaleString()} message${cell.count !== 1 ? "s" : ""}`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Less</span>
          {HEATMAP_THRESHOLDS.map((t) => (
            <Tooltip key={t.level}>
              <TooltipTrigger asChild>
                <div
                  className="rounded-[2px]"
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: getHeatmapColor(t.level),
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t.label}
              </TooltipContent>
            </Tooltip>
          ))}
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
```

**Design notes:**
- 13px cells with 3px gaps match GitHub's proportions
- Cells are `<button>` for keyboard accessibility — focusable, with aria-labels
- `filterFn` prop is the extension point for D2 (calendar filters) — the heatmap doesn't need to know about filter implementation details
- Month label positioning uses absolute positioning within a relative container for proper alignment
- `overflow-x-auto` on the grid allows horizontal scrolling on very narrow viewports
- Hover ring effect (`hover:ring-1`) provides subtle feedback without changing cell size

**Gotcha:** The month label positioning needs careful implementation. The approach shown uses a flex container with positioned children. An alternative is to pre-compute column positions and use CSS grid. The executor should test both approaches and pick whichever renders more cleanly.

**Verify:** Load the calendar page, confirm grid renders with correct dimensions. Hover over cells and verify tooltips appear. Click a cell with messages and confirm navigation to `/calendar/[dateKey]`.

---

#### Step 6: Create the YearSelector component

**File:** `/Users/robert.sawyer/Git/messagevault/components/calendar/year-selector.tsx` (NEW)

```typescript
// ABOUTME: Year navigation for the calendar heatmap — arrow-based with year display.
// ABOUTME: Constrains navigation to years with actual imported data.

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useCalendarStore } from "@/lib/stores/use-calendar-store";

export function YearSelector() {
  const { selectedYear, setSelectedYear } = useCalendarStore();
  const dateRange = useQuery(api.dailyStats.getDateRange);

  const canGoBack = dateRange
    ? selectedYear > dateRange.earliestYear
    : false;
  const canGoForward = dateRange
    ? selectedYear < dateRange.latestYear
    : false;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setSelectedYear(selectedYear - 1)}
        disabled={!canGoBack}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[4ch] text-center text-sm font-semibold tabular-nums">
        {selectedYear}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setSelectedYear(selectedYear + 1)}
        disabled={!canGoForward}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

**Design:** Simple and compact — fits naturally in the PageHeader action slot. `tabular-nums` ensures the year display doesn't shift width when changing years. Navigation buttons disable at the boundaries of available data.

**Verify:** Navigate years. Confirm buttons disable at boundaries. Confirm heatmap data updates reactively.

---

#### Step 7: Update the calendar page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/page.tsx`

Replace the entire placeholder with:

```typescript
// ABOUTME: Calendar heatmap page — GitHub-style visualization of message activity over time.
// ABOUTME: Shows yearly activity grid with year navigation, hover tooltips, and drill-down to day detail.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarHeatmap } from "@/components/calendar/calendar-heatmap";
import { YearSelector } from "@/components/calendar/year-selector";

export default function CalendarPage() {
  const dateRange = useQuery(api.dailyStats.getDateRange);

  // Still loading
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

  // No data imported yet
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
      <div className="p-6">
        <CalendarHeatmap />
      </div>
    </div>
  );
}
```

**Verify:** Load `/calendar`. If no data: empty state with import CTA. If data: heatmap renders with year selector in header.

---

### 4. Testing Strategy

**Type-check:**
```bash
pnpm build  # (with dev server stopped)
```

**Manual browser tests:**
1. Navigate to `/calendar` with no imported data — verify empty state
2. Import a conversation, then revisit `/calendar` — verify heatmap appears
3. Hover cells — verify tooltips show date and count
4. Click a cell with messages — verify navigation to `/calendar/[dateKey]`
5. Use year selector — verify grid updates
6. Check year boundaries — verify buttons disable correctly
7. Resize browser — verify grid doesn't overflow or break layout

**Edge cases to test:**
- Year with very sparse data (only a few days)
- Year with very dense data (messages every day)
- Leap year (Feb 29)
- Current year (partially filled)

---

### 5. Validation Checklist

- [ ] `convex/dailyStats.ts` exists with `listByYear` and `getDateRange` queries
- [ ] `lib/calendar-utils.ts` exists with grid computation functions
- [ ] `lib/stores/use-calendar-store.ts` exists with year state
- [ ] `components/calendar/calendar-heatmap.tsx` renders 52×7 grid
- [ ] `components/calendar/year-selector.tsx` navigates between years
- [ ] `app/(app)/calendar/page.tsx` integrates all components
- [ ] `globals.css` has 5 heatmap color variables
- [ ] Empty state shows when no data exists
- [ ] Hover tooltips show date and count
- [ ] Clicking a cell navigates to `/calendar/[dateKey]`
- [ ] Year selector disables at data boundaries
- [ ] Color legend displays below the grid
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] Every new file starts with two `ABOUTME:` comment lines
- [ ] All Convex queries use `getUserId(ctx)` auth pattern

---

### 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| Month labels misaligned | Visual inspection | Use CSS grid with `grid-template-columns` instead of absolute positioning. Pre-compute column indices from `getMonthLabels()`. |
| Grid wraps or overflows on small screens | Test at narrow widths | `overflow-x-auto` on grid container allows horizontal scroll. Consider a minimum width breakpoint. |
| `getDateRange` query is slow with many records | Check Convex dashboard query time | Alternative: derive year range from `conversations.dateRange` instead of scanning all `dailyStats`. |
| Convex index range query on `dateKey` string doesn't work as expected | Test with actual data | ISO date strings sort lexicographically correctly (YYYY-MM-DD format), so string range queries work. |
| Tooltip conflicts with cell click | Click + hover overlap | `TooltipTrigger asChild` on the button handles this correctly — tooltip appears on hover, click fires separately. |

---

### 7. Assumptions & Dependencies

**Must be true before execution:**
- Convex dev environment is running (`pnpm convex dev`)
- At least one conversation has been imported (to test with real data)
- The `dailyStats` table has records (created by import pipeline stage 6)

**Dependencies:**
- shadcn/ui `Tooltip` and `Skeleton` components (already installed)
- `lucide-react` for icons (already installed)
- Convex reactive queries (`useQuery`)
- Zustand for year state

**Decisions for executor:**
- **Month label rendering approach:** The plan shows absolute positioning, but CSS grid may be cleaner. The executor should try both.
- **Cell size responsiveness:** The plan uses fixed 13px cells. If the grid looks too small on large screens or too large on small screens, the executor can adjust. Consider using `clamp()` or a responsive multiplier.

---
---
