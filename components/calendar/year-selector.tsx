// ABOUTME: Year navigation control for the calendar heatmap — prev/next buttons with year display.
// ABOUTME: Constrains navigation to years that have actual data via getDateRange query.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCalendarStore } from "@/lib/stores/use-calendar-store";

function selectSelectedYear(state: { selectedYear: number }) {
  return state.selectedYear;
}

function selectSetSelectedYear(state: { setSelectedYear: (year: number) => void }) {
  return state.setSelectedYear;
}

export function YearSelector() {
  const selectedYear = useCalendarStore(selectSelectedYear);
  const setSelectedYear = useCalendarStore(selectSetSelectedYear);
  const dateRange = useQuery(api.dailyStats.getDateRange);

  const earliestYear = dateRange?.earliestYear ?? selectedYear;
  const latestYear = dateRange?.latestYear ?? selectedYear;

  const canGoPrev = selectedYear > earliestYear;
  const canGoNext = selectedYear < latestYear;

  function handlePrev() {
    if (canGoPrev) {
      setSelectedYear(selectedYear - 1);
    }
  }

  function handleNext() {
    if (canGoNext) {
      setSelectedYear(selectedYear + 1);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handlePrev}
        disabled={!canGoPrev}
        aria-label="Previous year"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[4ch] text-center text-sm font-medium tabular-nums">
        {selectedYear}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleNext}
        disabled={!canGoNext}
        aria-label="Next year"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
