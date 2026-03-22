// ABOUTME: Settings page — tabbed interface for profile, participants, and data management.
// ABOUTME: General tab has profile, AI, and appearance settings. Participants and Data tabs have their own views.

"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { ParticipantList } from "@/components/settings/participant-list";
import { ImportHistory } from "@/components/settings/import-history";
import { ConversationManager } from "@/components/settings/conversation-manager";
import { StorageUsage } from "@/components/settings/storage-usage";

export default function SettingsPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Settings"
        description="Manage your profile, preferences, and data"
      />

      <div className="px-6 py-6">
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="participants">Participants</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6 space-y-6">
            <ProfileSettings />
            <AiSettings />
            <AppearanceSettings />
          </TabsContent>

          <TabsContent value="participants" className="mt-6">
            <ParticipantList />
          </TabsContent>

          <TabsContent value="data" className="mt-6 space-y-6">
            <ImportHistory />
            <ConversationManager />
            <StorageUsage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
