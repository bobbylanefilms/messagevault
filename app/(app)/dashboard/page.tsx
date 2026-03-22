// ABOUTME: Dashboard placeholder page — will be built out in G1.
// ABOUTME: Serves as the post-login landing page for authenticated users.

import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function DashboardPage() {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="Dashboard"
      description="Welcome to MessageVault. Your message archive overview will appear here."
      action={{ label: "Import conversations", href: "/import" }}
    />
  );
}
