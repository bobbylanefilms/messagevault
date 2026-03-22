// ABOUTME: Live conversation list for the sidebar — queries Convex and renders items.
// ABOUTME: Shows loading skeleton, empty state, or sorted conversation items.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConversationItem } from "@/components/browse/conversation-item";
import { ConversationListSkeleton } from "@/components/shared/skeletons";
import { MessageSquare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConversationListProps {
  isCollapsed: boolean;
}

export function ConversationList({ isCollapsed }: ConversationListProps) {
  const conversations = useQuery(api.conversations.list);

  // Loading state
  if (conversations === undefined) {
    if (isCollapsed) {
      return (
        <div className="flex justify-center py-2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-sidebar-muted-foreground/30" />
        </div>
      );
    }
    return <ConversationListSkeleton count={4} />;
  }

  // Empty state
  if (conversations.length === 0) {
    if (isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex justify-center py-2">
              <MessageSquare className="h-4 w-4 text-sidebar-muted-foreground" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            No conversations yet
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-xs text-sidebar-muted-foreground mb-3">
          Import conversations to see them here
        </p>
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href="/import">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Import
          </Link>
        </Button>
      </div>
    );
  }

  // Conversation list
  return (
    <div className="space-y-0.5">
      {conversations.map((conv) => {
        const avatarColor =
          conv.firstParticipantColor ?? "oklch(0.55 0.16 275)";

        return (
          <ConversationItem
            key={conv._id}
            conversationId={conv._id}
            title={conv.title}
            participantNames={conv.participantNames}
            isGroupChat={conv.isGroupChat}
            messageCount={conv.messageCount}
            dateRange={conv.dateRange}
            avatarColor={avatarColor}
            isCollapsed={isCollapsed}
          />
        );
      })}
    </div>
  );
}
