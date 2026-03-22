// ABOUTME: Browse conversations placeholder — will be built in C1.
// ABOUTME: Will redirect to most recent conversation; currently shows empty state.

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function BrowsePage() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="Browse Conversations"
      description="Select a conversation from the sidebar, or import your first archive to get started."
      action={{ label: "Import conversations", href: "/import" }}
    />
  );
}
