// ABOUTME: Storage usage stats card showing counts for all major data types in the vault.
// ABOUTME: Pulls from dashboard.storageStats query and renders a responsive 2×3 stat grid.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare,
  MessagesSquare,
  Brain,
  CalendarDays,
  Bot,
} from "lucide-react";

interface StatItemProps {
  icon: React.ReactNode;
  label: string;
  count: number;
}

function StatItem({ icon, label, count }: StatItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-bold text-sm tabular-nums">
          {count.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function StorageUsage() {
  const stats = useQuery(api.dashboard.storageStats);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage Usage</CardTitle>
      </CardHeader>
      <CardContent>
        {stats === undefined ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatItem
              icon={<MessageSquare className="h-4 w-4" />}
              label="Messages"
              count={stats.totalMessages}
            />
            <StatItem
              icon={<MessagesSquare className="h-4 w-4" />}
              label="Conversations"
              count={stats.totalConversations}
            />
            <StatItem
              icon={<Brain className="h-4 w-4" />}
              label="Embeddings"
              count={stats.totalEmbeddings}
            />
            <StatItem
              icon={<CalendarDays className="h-4 w-4" />}
              label="Daily Stats"
              count={stats.totalDailyStats}
            />
            <StatItem
              icon={<Bot className="h-4 w-4" />}
              label="Chat Sessions"
              count={stats.totalChatSessions}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
