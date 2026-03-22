// ABOUTME: Settings placeholder — will be built in G2.
// ABOUTME: Will provide profile management, participant editing, and preferences.

import { Settings } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function SettingsPage() {
  return (
    <EmptyState
      icon={Settings}
      title="Settings"
      description="Manage your profile, participants, and preferences."
    />
  );
}
