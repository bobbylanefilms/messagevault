// ABOUTME: Single conversation row in the sidebar list — avatar, title, count, date.
// ABOUTME: Handles both expanded and collapsed sidebar states with tooltip fallback.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTimestamp } from "@/lib/date-utils";

interface ConversationItemProps {
  conversationId: string;
  title: string;
  participantNames: string[];
  isGroupChat: boolean;
  messageCount: number;
  dateRange: { start: number; end: number };
  avatarColor: string;
  isCollapsed: boolean;
}

export function ConversationItem({
  conversationId,
  title,
  participantNames,
  isGroupChat,
  messageCount,
  dateRange,
  avatarColor,
  isCollapsed,
}: ConversationItemProps) {
  const pathname = usePathname();
  const isActive = pathname === `/browse/${conversationId}`;

  // Display name: use participant names, fallback to title
  const displayName =
    participantNames.length > 0
      ? participantNames.join(", ")
      : title.replace("Messages with ", "");

  // Truncated display for long group chat names
  const truncatedName =
    displayName.length > 28
      ? displayName.slice(0, 25) + "..."
      : displayName;

  // Avatar initials (first char of first name)
  const initials = participantNames.length > 0
    ? participantNames[0]!.charAt(0).toUpperCase()
    : title.charAt(0).toUpperCase();

  const linkContent = (
    <Link
      href={`/browse/${conversationId}`}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        isCollapsed && "justify-center px-2"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-sidebar-primary" />
      )}

      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0 text-xs">
        <AvatarFallback
          style={{ backgroundColor: avatarColor }}
          className="text-white font-medium"
        >
          {isGroupChat ? (
            <Users className="h-3.5 w-3.5" />
          ) : (
            initials
          )}
        </AvatarFallback>
      </Avatar>

      {/* Text content — hidden when collapsed */}
      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium text-[13px]">
              {truncatedName}
            </span>
            <span className="shrink-0 text-[11px] text-sidebar-muted-foreground">
              {formatRelativeTimestamp(dateRange.end)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[11px] text-sidebar-muted-foreground truncate">
              {messageCount.toLocaleString()} messages
            </span>
            {isGroupChat && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[10px] shrink-0"
              >
                Group
              </Badge>
            )}
          </div>
        </div>
      )}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <div>
            <div className="font-medium">{displayName}</div>
            <div className="text-xs text-muted-foreground">
              {messageCount.toLocaleString()} messages
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}
