// ABOUTME: Date picker popover for jumping to a specific day in a conversation.
// ABOUTME: Constrains selectable range to the conversation's date range.

"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useBrowseStore } from "@/lib/stores/use-browse-store";
import { toDateKey } from "@/lib/date-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DateJumperProps {
  dateRange: { start: number; end: number };
  /** Set of dateKeys that have messages (for highlighting active days) */
  activeDateKeys?: Set<string>;
}

export function DateJumper({ dateRange, activeDateKeys }: DateJumperProps) {
  const [open, setOpen] = useState(false);
  const { setScrollToDateKey } = useBrowseStore();

  const fromDate = new Date(dateRange.start);
  const toDate = new Date(dateRange.end);

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    const dateKey = toDateKey(date.getTime());
    setScrollToDateKey(dateKey);
    setOpen(false);
  }

  // Modifier to style days that have messages
  const modifiers = activeDateKeys
    ? {
        hasMessages: (date: Date) => {
          const key = toDateKey(date.getTime());
          return activeDateKeys.has(key);
        },
      }
    : undefined;

  const modifiersStyles = activeDateKeys
    ? {
        hasMessages: {
          fontWeight: "700" as const,
        },
      }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Jump to date</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Navigate to a specific day</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          onSelect={handleSelect}
          fromDate={fromDate}
          toDate={toDate}
          defaultMonth={toDate}
          modifiers={modifiers}
          modifiersStyles={modifiersStyles}
        />
      </PopoverContent>
    </Popover>
  );
}
