// ABOUTME: Calendar filter function builder for the heatmap — converts active filter state into a count extractor.
// ABOUTME: Returns undefined when no filters are active, or a function that pulls filtered counts from DailyStat records.

import type { CalendarFilterState } from "@/components/calendar/calendar-filters";

interface DailyStatRecord {
  totalMessages: number;
  conversationBreakdown: { conversationId: string; count: number }[];
  participantBreakdown: { participantId: string; count: number }[];
}

/**
 * Builds a filter function for the calendar heatmap based on active filter state.
 * Returns undefined when no filters are active (heatmap uses totalMessages directly).
 * Returns a function that extracts the relevant filtered count from a DailyStat record.
 */
export function buildCalendarFilterFn(
  filters: CalendarFilterState
): ((stat: DailyStatRecord) => number) | undefined {
  const { conversationId, participantId } = filters;

  if (!conversationId && !participantId) {
    return undefined;
  }

  return (stat: DailyStatRecord): number => {
    if (conversationId && participantId) {
      // Both filters active — use conservative approximation (minimum of the two)
      const convEntry = stat.conversationBreakdown.find(
        (e) => e.conversationId === conversationId
      );
      const convCount = convEntry?.count ?? 0;

      const partEntry = stat.participantBreakdown.find(
        (e) => e.participantId === participantId
      );
      const partCount = partEntry?.count ?? 0;

      return Math.min(convCount, partCount);
    }

    if (conversationId) {
      const entry = stat.conversationBreakdown.find(
        (e) => e.conversationId === conversationId
      );
      return entry?.count ?? 0;
    }

    // participantId only
    const entry = stat.participantBreakdown.find(
      (e) => e.participantId === participantId
    );
    return entry?.count ?? 0;
  };
}
