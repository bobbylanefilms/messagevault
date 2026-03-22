// ABOUTME: Calendar heatmap placeholder — will be built in D1.
// ABOUTME: Will show GitHub-style activity visualization of message history.

import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function CalendarPage() {
  return (
    <EmptyState
      icon={Calendar}
      title="Calendar"
      description="A heatmap of your messaging activity will appear here once you've imported conversations."
      action={{ label: "Import conversations", href: "/import" }}
    />
  );
}
