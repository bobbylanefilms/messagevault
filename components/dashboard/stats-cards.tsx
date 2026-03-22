// ABOUTME: Dashboard stats cards — total messages, conversations, date range, and top participant.
// ABOUTME: Responsive 2x2 / 4-across grid with icons, numbers, and labels.
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, MessagesSquare, CalendarDays, Users } from "lucide-react";
import { formatDateRange } from "@/lib/date-utils";

export function StatsCards() {
  const stats = useQuery(api.dashboard.stats);

  if (stats === undefined) {
    return <StatsCardsSkeleton />;
  }

  const cards = [
    {
      icon: MessageSquare,
      label: "Total Messages",
      value: stats.totalMessages.toLocaleString(),
    },
    {
      icon: MessagesSquare,
      label: "Conversations",
      value: stats.totalConversations.toString(),
    },
    {
      icon: CalendarDays,
      label: "Date Range",
      value: stats.dateRange
        ? formatDateRange(stats.dateRange.start, stats.dateRange.end)
        : "No data",
    },
    {
      icon: Users,
      label: "Top Contact",
      value: stats.topParticipants[0]?.displayName ?? "—",
      detail: stats.topParticipants[0]
        ? `${stats.topParticipants[0].messageCount.toLocaleString()} messages`
        : undefined,
      dotColor: stats.topParticipants[0]?.avatarColor,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <card.icon className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <div className="flex items-center gap-2">
                {card.dotColor && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: card.dotColor }}
                  />
                )}
                <p className="text-lg font-semibold leading-tight truncate">
                  {card.value}
                </p>
              </div>
              {card.detail && (
                <p className="text-xs text-muted-foreground">{card.detail}</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-start gap-3 p-4">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
