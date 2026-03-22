// ABOUTME: Calendar page — shows a GitHub-style heatmap of daily message activity.
// ABOUTME: Supports conversation and participant filters via URL params, with Suspense for useSearchParams.

"use client";

import { Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarHeatmap } from "@/components/calendar/calendar-heatmap";
import { YearSelector } from "@/components/calendar/year-selector";
import { CalendarFilters, useCalendarFilters } from "@/components/calendar/calendar-filters";
import { buildCalendarFilterFn } from "@/lib/calendar-filter";
import { Skeleton } from "@/components/ui/skeleton";

function CalendarContent() {
  const filters = useCalendarFilters();
  const filterFn = buildCalendarFilterFn(filters);
  return <CalendarHeatmap filterFn={filterFn} />;
}

export default function CalendarPage() {
  const dateRange = useQuery(api.dailyStats.getDateRange);

  // Loading state — dateRange is undefined while query is in flight
  if (dateRange === undefined) {
    return (
      <div>
        <PageHeader title="Calendar" description="Message activity over time" />
        <div className="p-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-32 w-full max-w-3xl" />
          </div>
        </div>
      </div>
    );
  }

  // No data — show empty state prompting import
  if (dateRange === null) {
    return (
      <EmptyState
        icon={Calendar}
        title="No calendar data yet"
        description="Import your message conversations to see a heatmap of your messaging activity over time."
        action={{ label: "Import conversations", href: "/import" }}
      />
    );
  }

  // Data exists — show heatmap with year selector and filters
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
