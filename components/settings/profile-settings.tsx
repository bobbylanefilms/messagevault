// ABOUTME: Profile settings card — display name and real name editing.
// ABOUTME: Real name is used for "Me" identity mapping during conversation import.

"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function ProfileSettings() {
  const user = useQuery(api.users.currentUser);
  const updateProfile = useMutation(api.users.updateProfile);
  const [displayName, setDisplayName] = useState("");
  const [realName, setRealName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setRealName(user.realName);
    }
  }, [user]);

  if (user === undefined) {
    return <ProfileSettingsSkeleton />;
  }

  async function handleSave() {
    if (!displayName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        realName: realName.trim(),
      });
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }

  const hasChanges =
    user && (displayName !== user.displayName || realName !== user.realName);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your identity in MessageVault</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="max-w-md"
            placeholder="Your display name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="realName">Real Name</Label>
          <Input
            id="realName"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            className="max-w-md"
            placeholder="Your real name"
          />
          <p className="text-xs text-muted-foreground">
            Used to identify your messages during import. This maps to the &quot;Me&quot; identity in conversations.
          </p>
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

function ProfileSettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-9 w-20" />
      </CardContent>
    </Card>
  );
}
