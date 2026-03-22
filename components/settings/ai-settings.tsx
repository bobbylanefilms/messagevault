// ABOUTME: AI preferences card — model selector and extended thinking toggle.
// ABOUTME: Saves defaultModel and thinkingEnabled while preserving the current theme preference.

"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const MODELS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Most capable" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Fast & capable" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Fastest" },
];

export function AiSettings() {
  const user = useQuery(api.users.currentUser);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const [defaultModel, setDefaultModel] = useState("claude-sonnet-4-6");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.preferences) {
      setDefaultModel(user.preferences.defaultModel);
      setThinkingEnabled(user.preferences.thinkingEnabled);
    }
  }, [user]);

  if (user === undefined) {
    return <AiSettingsSkeleton />;
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await updatePreferences({
        defaultModel,
        thinkingEnabled,
        theme: user!.preferences.theme,
      });
      toast.success("AI preferences updated");
    } catch {
      toast.error("Failed to update AI preferences");
    } finally {
      setIsSaving(false);
    }
  }

  const hasChanges =
    user &&
    (defaultModel !== user.preferences.defaultModel ||
      thinkingEnabled !== user.preferences.thinkingEnabled);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Settings</CardTitle>
        <CardDescription>Configure the AI model used for chat</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="defaultModel">Default Model</Label>
          <Select value={defaultModel} onValueChange={setDefaultModel}>
            <SelectTrigger id="defaultModel" className="max-w-md">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  <span className="font-medium">{model.label}</span>
                  <span className="ml-2 text-muted-foreground text-sm">— {model.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between max-w-md">
          <div className="space-y-1">
            <Label htmlFor="thinkingEnabled">Extended Thinking</Label>
            <p className="text-xs text-muted-foreground">
              Enables deeper reasoning for complex questions. Slower but more thorough.
            </p>
          </div>
          <Switch
            id="thinkingEnabled"
            checked={thinkingEnabled}
            onCheckedChange={setThinkingEnabled}
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          size="sm"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AiSettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-6">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-9 w-20" />
      </CardContent>
    </Card>
  );
}
