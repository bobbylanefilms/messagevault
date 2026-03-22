// ABOUTME: Day divider pill shown between date boundaries in the message thread.
// ABOUTME: Displays formatted date like "Tuesday, January 15, 2023" as a centered pill.

import { formatDayHeader } from "@/lib/date-utils";

interface DayDividerProps {
  dateKey: string;
}

export function DayDivider({ dateKey }: DayDividerProps) {
  return (
    <div className="flex justify-center py-3">
      <div className="rounded-full bg-muted/60 px-3.5 py-1 text-[11px] font-medium text-muted-foreground">
        {formatDayHeader(dateKey)}
      </div>
    </div>
  );
}
