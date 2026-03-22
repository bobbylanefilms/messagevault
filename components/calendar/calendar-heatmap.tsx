// ABOUTME: GitHub-style calendar heatmap showing daily message activity for a year.
// ABOUTME: Clickable cells navigate to day detail view; supports optional filterFn for D2 integration.

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCalendarStore } from "@/lib/stores/use-calendar-store";
import {
  buildHeatmapGrid,
  getMonthLabels,
  getHeatmapColor,
  HEATMAP_THRESHOLDS,
  type HeatmapCell,
} from "@/lib/calendar-utils";
import { fromDateKey } from "@/lib/date-utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DailyStatRecord {
  totalMessages: number;
  conversationBreakdown: { conversationId: string; count: number }[];
  participantBreakdown: { participantId: string; count: number }[];
}

interface CalendarHeatmapProps {
  filterFn?: (stat: DailyStatRecord) => number;
}

const CELL_SIZE = 13;
const CELL_GAP = 3;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const DAY_LABEL_WIDTH = 32;

function selectSelectedYear(state: { selectedYear: number }) {
  return state.selectedYear;
}

export function CalendarHeatmap({ filterFn }: CalendarHeatmapProps) {
  const router = useRouter();
  const selectedYear = useCalendarStore(selectSelectedYear);
  const rawStats = useQuery(api.dailyStats.listByYear, {
    year: selectedYear,
  });

  // Build a Map<dateKey, count> from the raw stats, applying filterFn if provided
  const statsMap = useMemo(() => {
    if (!rawStats) return null;
    const map = new Map<string, number>();
    for (const stat of rawStats) {
      const count = filterFn
        ? filterFn(stat as unknown as DailyStatRecord)
        : stat.totalMessages;
      if (count > 0) {
        map.set(stat.dateKey, count);
      }
    }
    return map;
  }, [rawStats, filterFn]);

  const grid = useMemo(() => {
    if (!statsMap) return null;
    return buildHeatmapGrid(selectedYear, statsMap);
  }, [selectedYear, statsMap]);

  const monthLabels = useMemo(
    () => getMonthLabels(selectedYear),
    [selectedYear]
  );

  if (!grid) {
    return <HeatmapSkeleton />;
  }

  const numWeeks = grid.length;

  function handleCellClick(cell: HeatmapCell) {
    if (cell.count > 0) {
      router.push(`/calendar/${cell.dateKey}`);
    }
  }

  function formatCellTooltip(cell: HeatmapCell): string {
    const date = fromDateKey(cell.dateKey);
    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (cell.count === 0) return `No messages on ${dateStr}`;
    if (cell.count === 1) return `1 message on ${dateStr}`;
    return `${cell.count} messages on ${dateStr}`;
  }

  return (
    <TooltipProvider>
      <div className="inline-block overflow-x-auto">
        {/* Month labels row */}
        <div
          className="flex text-xs text-muted-foreground"
          style={{ paddingLeft: DAY_LABEL_WIDTH }}
        >
          {monthLabels.map((ml, i) => {
            // Calculate the pixel offset for this month label
            const nextCol =
              i < monthLabels.length - 1
                ? monthLabels[i + 1]!.col
                : numWeeks;
            const colSpan = nextCol - ml.col;
            return (
              <span
                key={ml.label}
                className="truncate"
                style={{
                  width: colSpan * (CELL_SIZE + CELL_GAP),
                }}
              >
                {ml.label}
              </span>
            );
          })}
        </div>

        {/* Grid area with day labels */}
        <div className="mt-1 flex">
          {/* Day-of-week labels */}
          <div
            className="flex flex-col justify-between text-xs text-muted-foreground"
            style={{
              width: DAY_LABEL_WIDTH,
              height: 7 * (CELL_SIZE + CELL_GAP) - CELL_GAP,
            }}
          >
            {DAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="flex items-center"
                style={{ height: CELL_SIZE }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Heatmap cells */}
          <div
            className="flex"
            style={{ gap: CELL_GAP }}
          >
            {grid.map((week, weekIdx) => (
              <div
                key={weekIdx}
                className="flex flex-col"
                style={{ gap: CELL_GAP }}
              >
                {week.map((cell, dayIdx) => {
                  if (!cell) {
                    return (
                      <div
                        key={dayIdx}
                        style={{
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                        }}
                      />
                    );
                  }

                  return (
                    <Tooltip key={dayIdx}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rounded-sm transition-colors hover:ring-1 hover:ring-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            backgroundColor: getHeatmapColor(cell.level),
                            cursor:
                              cell.count > 0 ? "pointer" : "default",
                          }}
                          aria-label={formatCellTooltip(cell)}
                          onClick={() => handleCellClick(cell)}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={4}>
                        {formatCellTooltip(cell)}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <span>Less</span>
          {HEATMAP_THRESHOLDS.map((t) => (
            <Tooltip key={t.level}>
              <TooltipTrigger asChild>
                <div
                  className="rounded-sm"
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: getHeatmapColor(t.level),
                  }}
                  aria-label={`${t.label} messages`}
                />
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {t.label} messages
              </TooltipContent>
            </Tooltip>
          ))}
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}

function HeatmapSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full max-w-3xl" />
      <div className="flex gap-1">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            {Array.from({ length: 7 }).map((_, j) => (
              <Skeleton
                key={j}
                className="rounded-sm"
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
