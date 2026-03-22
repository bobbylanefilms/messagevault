// ABOUTME: Calendar filter controls — conversation and participant dropdowns with clear button.
// ABOUTME: Reads/writes URL search params so filters persist across navigation and page refresh.

"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
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
import { X } from "lucide-react";

export interface CalendarFilterState {
  conversationId: string | null;
  participantId: string | null;
}

/** Reads active calendar filters from URL search params. */
export function useCalendarFilters(): CalendarFilterState {
  const searchParams = useSearchParams();
  return {
    conversationId: searchParams.get("conversationId"),
    participantId: searchParams.get("participantId"),
  };
}

export function CalendarFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const conversations = useQuery(api.conversations.list);
  const participants = useQuery(api.participants.list);

  const activeConversationId = searchParams.get("conversationId");
  const activeParticipantId = searchParams.get("participantId");
  const hasActiveFilter = !!activeConversationId || !!activeParticipantId;

  function updateFilter(key: "conversationId" | "participantId", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "__all__") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearFilters() {
    router.replace(pathname, { scroll: false });
  }

  // Strip "Messages with " prefix from conversation titles
  function getConversationLabel(conv: {
    title: string;
    participantNames: string[];
    isGroupChat: boolean;
  }): string {
    if (conv.participantNames.length > 0) {
      return conv.participantNames.join(", ");
    }
    return conv.title.replace(/^Messages with\s+/i, "");
  }

  const nonMeParticipants = participants
    ? [...participants]
        .filter((p) => !p.isMe)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
    : [];

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeConversationId ?? "__all__"}
        onValueChange={(val) => updateFilter("conversationId", val)}
      >
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="All conversations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">
            All conversations
          </SelectItem>
          {(conversations ?? []).map((conv) => (
            <SelectItem key={conv._id} value={conv._id} className="text-xs">
              {getConversationLabel(conv)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activeParticipantId ?? "__all__"}
        onValueChange={(val) => updateFilter("participantId", val)}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="All participants" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">
            All participants
          </SelectItem>
          {nonMeParticipants.map((p) => (
            <SelectItem key={p._id} value={p._id} className="text-xs">
              {p.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={clearFilters}
        >
          <X className="mr-1 h-3 w-3" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
