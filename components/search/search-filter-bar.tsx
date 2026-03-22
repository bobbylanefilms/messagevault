// ABOUTME: Search filter bar — conversation, participant, date range, and message type selectors.
// ABOUTME: Follows the calendar-filters.tsx pattern using shadcn Select and URL-synced state.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { X, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

interface SearchFilterBarProps {
  conversationId: string | null;
  participantId: string | null;
  dateRangeStart: number | null;
  dateRangeEnd: number | null;
  messageType: string | null;
  onConversationChange: (id: string | null) => void;
  onParticipantChange: (id: string | null) => void;
  onDateRangeChange: (start: number | null, end: number | null) => void;
  onMessageTypeChange: (type: string | null) => void;
  onClearAll: () => void;
}

export function SearchFilterBar({
  conversationId,
  participantId,
  dateRangeStart,
  dateRangeEnd,
  messageType,
  onConversationChange,
  onParticipantChange,
  onDateRangeChange,
  onMessageTypeChange,
  onClearAll,
}: SearchFilterBarProps) {
  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  const hasAnyFilter = !!(conversationId || participantId || dateRangeStart || messageType);

  // Date range state for the calendar picker
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    dateRangeStart
      ? {
          from: new Date(dateRangeStart),
          to: dateRangeEnd ? new Date(dateRangeEnd) : undefined,
        }
      : undefined
  );

  function handleDateSelect(range: DateRange | undefined) {
    setDateRange(range);
    if (range?.from) {
      const start = range.from.getTime();
      const end = range.to ? range.to.getTime() + 86400000 - 1 : start + 86400000 - 1;
      onDateRangeChange(start, end);
    } else {
      onDateRangeChange(null, null);
    }
  }

  const nonMeParticipants = participants
    ? [...participants].filter((p) => !p.isMe).sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [];

  function getConversationLabel(conv: { title: string; participantNames: string[] }): string {
    if (conv.participantNames.length > 0) return conv.participantNames.join(", ");
    return conv.title.replace(/^Messages with\s+/i, "");
  }

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "MMM d")} \u2013 ${format(dateRange.to, "MMM d, yyyy")}`
      : format(dateRange.from, "MMM d, yyyy")
    : "Date range";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Conversation filter */}
      <Select
        value={conversationId ?? "__all__"}
        onValueChange={(val) => onConversationChange(val === "__all__" ? null : val)}
      >
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="All conversations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">All conversations</SelectItem>
          {(conversations ?? []).map((conv) => (
            <SelectItem key={conv._id} value={conv._id} className="text-xs">
              {getConversationLabel(conv)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Participant filter */}
      <Select
        value={participantId ?? "__all__"}
        onValueChange={(val) => onParticipantChange(val === "__all__" ? null : val)}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="All people" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">All people</SelectItem>
          {nonMeParticipants.map((p) => (
            <SelectItem key={p._id} value={p._id} className="text-xs">
              {p.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Date range picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Message type filter */}
      <Select
        value={messageType ?? "__all__"}
        onValueChange={(val) => onMessageTypeChange(val === "__all__" ? null : val)}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">All types</SelectItem>
          <SelectItem value="text" className="text-xs">Text</SelectItem>
          <SelectItem value="image" className="text-xs">Images</SelectItem>
          <SelectItem value="video" className="text-xs">Videos</SelectItem>
          <SelectItem value="link" className="text-xs">Links</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear filters button */}
      {hasAnyFilter && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearAll}>
          <X className="mr-1 h-3 w-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
