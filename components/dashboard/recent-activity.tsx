// ABOUTME: Recent activity panel showing the 5 most recent messages across all conversations.
// ABOUTME: Each row links to the source conversation; supports empty state and skeleton loading.
"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { formatRelativeTimestamp } from "@/lib/date-utils";

export function RecentActivity() {
  const router = useRouter();
  const messages = useQuery(api.dashboard.recentMessages);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {messages === undefined ? (
          <RecentActivitySkeleton />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center px-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-muted-foreground">
              <Link href="/import" className="underline underline-offset-2 hover:text-foreground">
                Import a conversation
              </Link>{" "}
              to see recent activity here.
            </p>
          </div>
        ) : (
          <ul>
            {messages.map((msg) => (
              <li
                key={msg._id}
                className="border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(`/browse/${msg.conversationId}`)}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">
                        {msg.senderName}
                      </span>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {msg.conversationTitle}
                      </Badge>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTimestamp(msg.timestamp)}
                    </span>
                  </div>
                  {msg.content && (
                    <p className="mt-0.5 text-sm text-muted-foreground truncate">
                      {msg.content.length > 80
                        ? msg.content.slice(0, 80) + "…"
                        : msg.content}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivitySkeleton() {
  return (
    <ul>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="border-b border-border last:border-b-0 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="mt-1.5 h-3 w-48" />
        </li>
      ))}
    </ul>
  );
}
