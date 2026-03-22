// ABOUTME: Calendar day detail placeholder — will be built in D3.
// ABOUTME: Will show all messages from a specific day grouped by conversation.

import { Calendar } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default async function CalendarDayPage({
  params,
}: {
  params: Promise<{ dateKey: string }>;
}) {
  const { dateKey } = await params;

  return (
    <EmptyState
      icon={Calendar}
      title="Day Detail"
      description={`All messages from ${dateKey} will appear here.`}
    />
  );
}
