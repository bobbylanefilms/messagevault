// ABOUTME: Browse page — redirects to the most recently active conversation.
// ABOUTME: Shows empty state with import CTA if no conversations exist.

"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { MessageThreadSkeleton } from "@/components/shared/skeletons";

export default function BrowsePage() {
  const conversations = useQuery(api.conversations.list);
  const router = useRouter();

  useEffect(() => {
    if (conversations && conversations.length > 0) {
      router.replace(`/browse/${conversations[0]!._id}`);
    }
  }, [conversations, router]);

  // Loading
  if (conversations === undefined) {
    return (
      <div className="p-6">
        <MessageThreadSkeleton />
      </div>
    );
  }

  // No conversations — show empty state
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No Conversations Yet"
        description="Import your Apple Messages archive to start browsing your message history."
        action={{ label: "Import conversations", href: "/import" }}
      />
    );
  }

  // Brief loading while redirect happens
  return (
    <div className="p-6">
      <MessageThreadSkeleton />
    </div>
  );
}
