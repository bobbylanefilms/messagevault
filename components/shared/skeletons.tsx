// ABOUTME: Composable loading skeleton components matching the shape of real content.
// ABOUTME: Built on top of the shadcn Skeleton primitive for consistent animation.

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton for a single conversation list item in the sidebar.
 * Matches: avatar circle + two lines of text (title + preview).
 */
export function ConversationItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/**
 * Skeleton for the full conversation list (multiple items).
 */
export function ConversationListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }, (_, i) => (
        <ConversationItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a single message bubble in the thread view.
 * Alternates alignment to mimic real message layout.
 */
function MessageBubbleSkeleton({ isMe }: { isMe: boolean }) {
  return (
    <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "space-y-1.5 rounded-2xl px-4 py-3",
          isMe ? "max-w-[65%]" : "max-w-[70%]",
        )}
      >
        {!isMe && <Skeleton className="mb-1 h-3 w-16" />}
        <Skeleton className={cn("h-3.5", isMe ? "w-48" : "w-56")} />
        <Skeleton className={cn("h-3.5", isMe ? "w-32" : "w-40")} />
      </div>
    </div>
  );
}

/**
 * Skeleton for a message thread (alternating bubbles with day divider).
 */
export function MessageThreadSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {/* Day divider skeleton */}
      <div className="flex justify-center py-2">
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <MessageBubbleSkeleton key={i} isMe={i % 3 === 0} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a stats card on the dashboard.
 * Matches: title + large number + optional trend indicator.
 */
export function StatsCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-6">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/**
 * Skeleton for a grid of stats cards.
 */
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a search result item.
 */
export function SearchResultSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-4/5" />
    </div>
  );
}
