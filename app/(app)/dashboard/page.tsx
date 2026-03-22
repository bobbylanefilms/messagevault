// ABOUTME: Dashboard page — archive overview with stats, activity, heatmap, and navigation.
// ABOUTME: Post-login landing page showing personalized welcome and quick access to features.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Upload, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { MiniHeatmap } from "@/components/dashboard/mini-heatmap";
import { ConversationNav } from "@/components/dashboard/conversation-nav";

export default function DashboardPage() {
  const user = useQuery(api.users.currentUser);
  const stats = useQuery(api.dashboard.stats);

  const hasData = stats !== undefined && stats.totalConversations > 0;
  const isLoading = stats === undefined;

  return (
    <div className="flex flex-col">
      <PageHeader title="Dashboard">
        <Button variant="outline" size="sm" asChild>
          <Link href="/import">
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Link>
        </Button>
      </PageHeader>

      <div className="px-6 py-6 space-y-6">
        {user && (
          <p className="text-lg text-muted-foreground">
            Welcome back, <span className="text-foreground font-medium">{user.displayName}</span>
          </p>
        )}

        {!isLoading && !hasData ? (
          <EmptyState
            icon={LayoutDashboard}
            title="No messages yet"
            description="Import your first conversation to see your message archive overview."
            action={{ label: "Import conversations", href: "/import" }}
          />
        ) : (
          <>
            <StatsCards />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <MiniHeatmap />
                <RecentActivity />
              </div>
              <div>
                <ConversationNav />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
