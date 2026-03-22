// ABOUTME: Previous/next day navigation controls for the calendar day detail view.
// ABOUTME: Includes a back-to-heatmap button and date-aware prev/next chevrons with tooltips.

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

function formatTooltipDate(dateKey: string): string {
  return fromDateKey(dateKey).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DayNavigation({ dateKey }: DayNavigationProps) {
  const prevDay = useQuery(api.dailyStats.getPreviousDay, { dateKey });
  const nextDay = useQuery(api.dailyStats.getNextDay, { dateKey });

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
          <TooltipContent side="bottom">Back to heatmap</TooltipContent>
        </Tooltip>

        {/* Vertical separator */}
        <div className="mx-1 h-5 w-px bg-border" />

        {/* Previous day */}
        <Tooltip>
          <TooltipTrigger asChild>
            {prevDay ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link href={`/calendar/${prevDay}`}>
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {prevDay ? formatTooltipDate(prevDay) : "No earlier days"}
          </TooltipContent>
        </Tooltip>

        {/* Next day */}
        <Tooltip>
          <TooltipTrigger asChild>
            {nextDay ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <Link href={`/calendar/${nextDay}`}>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {nextDay ? formatTooltipDate(nextDay) : "No later days"}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
