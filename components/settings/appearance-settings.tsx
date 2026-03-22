// ABOUTME: Appearance settings card — theme selector with dark, light, and system options.
// ABOUTME: Applies theme immediately via CSS class and localStorage, then persists to Convex.

"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Theme = "dark" | "light" | "system";

function getEffectiveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applyTheme(theme: Theme) {
  const effective = getEffectiveTheme(theme);
  document.documentElement.classList.toggle("dark", effective === "dark");
  localStorage.setItem("messagevault-theme", theme);
}

const THEME_OPTIONS: { value: Theme; label: string; description: string; Icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", description: "Always use dark mode", Icon: Moon },
  { value: "light", label: "Light", description: "Always use light mode", Icon: Sun },
  { value: "system", label: "System", description: "Follow system preference", Icon: Monitor },
];

export function AppearanceSettings() {
  const user = useQuery(api.users.currentUser);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.preferences?.theme) {
      const stored = user.preferences.theme as Theme;
      if (["dark", "light", "system"].includes(stored)) {
        setTheme(stored);
      }
    }
  }, [user]);

  // Listen for system color scheme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const effective = getEffectiveTheme("system");
      document.documentElement.classList.toggle("dark", effective === "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  if (user === undefined) {
    return <AppearanceSettingsSkeleton />;
  }

  function handleSelectTheme(value: Theme) {
    setTheme(value);
    applyTheme(value);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await updatePreferences({
        defaultModel: user!.preferences.defaultModel,
        thinkingEnabled: user!.preferences.thinkingEnabled,
        theme,
      });
      toast.success("Appearance updated");
    } catch {
      toast.error("Failed to update appearance");
    } finally {
      setIsSaving(false);
    }
  }

  const hasChanges = user && theme !== user.preferences.theme;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how MessageVault looks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {THEME_OPTIONS.map(({ value, label, description, Icon }) => (
            <button
              key={value}
              onClick={() => handleSelectTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                theme === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="font-medium">{label}</span>
              <span className="text-xs text-center leading-tight opacity-75">{description}</span>
            </button>
          ))}
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

function AppearanceSettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 max-w-md">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-20" />
      </CardContent>
    </Card>
  );
}
