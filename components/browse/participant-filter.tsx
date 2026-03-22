// ABOUTME: Multi-select participant filter for group chat conversations.
// ABOUTME: Shows checkboxes for each participant; filters messages in the thread view.

"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useBrowseStore } from "@/lib/stores/use-browse-store";

interface Participant {
  _id: string;
  displayName: string;
  isMe: boolean;
  avatarColor: string;
}

interface ParticipantFilterProps {
  participants: Participant[];
}

export function ParticipantFilter({ participants }: ParticipantFilterProps) {
  const [open, setOpen] = useState(false);
  const { selectedParticipantIds, toggleParticipant, clearParticipantFilter } =
    useBrowseStore();

  const isFiltered = selectedParticipantIds.length > 0;
  const selectedCount = selectedParticipantIds.length;

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={isFiltered ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5 text-xs"
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {isFiltered
                ? `${selectedCount} selected`
                : "Filter people"}
            </span>
            {isFiltered && (
              <Badge
                variant="secondary"
                className="ml-0.5 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center sm:hidden"
              >
                {selectedCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <div className="p-3 pb-2">
            <p className="text-xs font-medium text-muted-foreground">
              Show messages from:
            </p>
          </div>
          <Separator />
          <ScrollArea className="max-h-64">
            <div className="p-2 space-y-1">
              {participants.map((participant) => {
                const isSelected = selectedParticipantIds.includes(
                  participant._id
                );
                return (
                  <button
                    key={participant._id}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                    onClick={() => toggleParticipant(participant._id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: participant.avatarColor }}
                    />
                    <span className="truncate">
                      {participant.displayName}
                      {participant.isMe && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          {isFiltered && (
            <>
              <Separator />
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    clearParticipantFilter();
                    setOpen(false);
                  }}
                >
                  Clear filter
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Quick clear button shown when filter is active */}
      {isFiltered && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={clearParticipantFilter}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Clear participant filter</span>
        </Button>
      )}
    </div>
  );
}
