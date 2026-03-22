// ABOUTME: Toolbar above the message thread — date jumper, participant filter, filter count.
// ABOUTME: Only shows participant filter for group chats.

"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { DateJumper } from "@/components/browse/date-jumper";
import { ParticipantFilter } from "@/components/browse/participant-filter";
import { useBrowseStore } from "@/lib/stores/use-browse-store";

interface Participant {
  _id: string;
  displayName: string;
  isMe: boolean;
  avatarColor: string;
}

interface ThreadToolbarProps {
  isGroupChat: boolean;
  participants: Participant[];
  dateRange: { start: number; end: number };
  activeDateKeys?: Set<string>;
  totalMessages: number;
  filteredMessages: number;
}

export function ThreadToolbar({
  isGroupChat,
  participants,
  dateRange,
  activeDateKeys,
  totalMessages,
  filteredMessages,
}: ThreadToolbarProps) {
  const { selectedParticipantIds } = useBrowseStore();
  const isFiltered = selectedParticipantIds.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-between border-b border-border px-4 py-1.5">
        <div className="flex items-center gap-2">
          <DateJumper dateRange={dateRange} activeDateKeys={activeDateKeys} />
          {isGroupChat && (
            <ParticipantFilter participants={participants} />
          )}
        </div>

        {/* Filter count indicator */}
        {isFiltered && (
          <span className="text-[11px] text-muted-foreground">
            Showing {filteredMessages.toLocaleString()} of{" "}
            {totalMessages.toLocaleString()}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
