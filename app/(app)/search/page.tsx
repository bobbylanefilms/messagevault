// ABOUTME: Search placeholder — will be built in E4.
// ABOUTME: Will provide hybrid keyword + semantic search across all conversations.

import { Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function SearchPage() {
  return (
    <EmptyState
      icon={Search}
      title="Search"
      description="Search across all your conversations with keywords and semantic understanding."
    />
  );
}
