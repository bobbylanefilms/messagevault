// ABOUTME: Scaled-down calendar heatmap for the dashboard overview panel.
// ABOUTME: Shows message activity at 65% scale; links to the full calendar view.
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { CalendarHeatmap } from "@/components/calendar/calendar-heatmap";

export function MiniHeatmap() {
  const dateRange = useQuery(api.dailyStats.getDateRange);

  // Return null when data hasn't loaded yet or there's nothing to show
  if (dateRange === undefined || dateRange === null) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Message Activity</CardTitle>
        <Link
          href="/calendar"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View calendar →
        </Link>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <div
          className="overflow-hidden px-4"
          style={{ height: "160px" }}
        >
          <div style={{ transform: "scale(0.65)", transformOrigin: "top left" }}>
            <CalendarHeatmap />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
