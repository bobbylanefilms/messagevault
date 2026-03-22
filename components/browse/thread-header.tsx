// ABOUTME: Thread header bar showing conversation title, participants, and metadata.
// ABOUTME: Displays above the virtualized message list in the browse view.

import { formatDateRange } from "@/lib/date-utils";

interface ThreadHeaderProps {
  title: string;
  participantNames: string[];
  isGroupChat: boolean;
  messageCount: number;
  dateRange: { start: number; end: number };
}

export function ThreadHeader({
  title,
  participantNames,
  isGroupChat,
  messageCount,
  dateRange,
}: ThreadHeaderProps) {
  const displayTitle = participantNames.length > 0
    ? participantNames.join(", ")
    : title.replace("Messages with ", "");

  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {displayTitle}
        </h1>
        <p className="text-[12px] text-muted-foreground">
          {messageCount.toLocaleString()} messages
          {isGroupChat && ` · ${participantNames.length + 1} people`}
          {dateRange.start > 0 && ` · ${formatDateRange(dateRange.start, dateRange.end)}`}
        </p>
      </div>
    </div>
  );
}
