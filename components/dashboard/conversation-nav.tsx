// ABOUTME: Dashboard conversation navigator — top 5 conversations with participant names and message counts.
// ABOUTME: Each row links to the conversation browse view; supports empty state and skeleton loading.
"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessagesSquare } from "lucide-react";
import Link from "next/link";

export function ConversationNav() {
  const router = useRouter();
  const conversations = useQuery(api.conversations.list);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Conversations</CardTitle>
        <Link
          href="/browse"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Browse all →
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {conversations === undefined ? (
          <ConversationNavSkeleton />
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
            <MessagesSquare className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          <ul>
            {conversations.slice(0, 5).map((conv) => (
              <li
                key={conv._id}
                className="border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(`/browse/${conv._id}`)}
              >
                <div className="py-2.5 px-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <Badge variant="secondary" className="shrink-0 text-xs tabular-nums">
                      {conv.messageCount.toLocaleString()}
                    </Badge>
                  </div>
                  {conv.participantNames.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {conv.participantNames.join(", ")}
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

function ConversationNavSkeleton() {
  return (
    <ul>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="border-b border-border last:border-b-0 py-2.5 px-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-10 rounded-full" />
          </div>
          <Skeleton className="mt-1.5 h-3 w-24" />
        </li>
      ))}
    </ul>
  );
}
