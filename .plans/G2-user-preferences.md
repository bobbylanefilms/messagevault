# Handoff Plan: G2 — User Preferences

## 1. Problem Summary

Build the settings page for user profile and app preferences. Users can edit their display name, real name (used for "Me" identity mapping during import), default AI model, thinking toggle, and theme preference. Currently a placeholder EmptyState at `app/(app)/settings/page.tsx`.

**Why:** Users need to customize their experience — set their name for message attribution, choose AI model defaults, and select their preferred theme. The settings page also establishes the tabbed structure that G3 and G4 will populate.

**Success Criteria:**
- Profile section: edit display name and real name with explanatory text
- AI section: model selector (Opus 4.6 / Sonnet 4.6 / Haiku 4.5) and thinking toggle
- Appearance section: theme selector (dark / light / system) with immediate preview
- Save button with loading state and success toast feedback
- Preferences persist to database and take effect immediately
- Theme selection integrates with existing `ThemeToggle` localStorage pattern
- Settings page creates the Tabs structure for G3 (Participants) and G4 (Data) tabs

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx` — Placeholder EmptyState. Will be completely replaced with tabbed settings.
- `/Users/robert.sawyer/Git/messagevault/convex/users.ts` — Has `currentUser` query and `ensureUser` mutation. Needs `updateProfile` and `updatePreferences` mutations added.
- `/Users/robert.sawyer/Git/messagevault/convex/lib/auth.ts` — `getUserId(ctx)` returns the authenticated user's Convex `_id`. Used by all mutations.
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — Users table has `preferences: v.object({ defaultModel: v.string(), thinkingEnabled: v.boolean(), theme: v.string() })`. The full preferences object must be passed on update (Convex patches nested objects by replacement).
- `/Users/robert.sawyer/Git/messagevault/components/shell/theme-toggle.tsx` — Current theme toggle: reads/writes `messagevault-theme` localStorage key, toggles `dark` class on `<html>`. Currently only supports dark/light toggle. Needs extension for "system" mode and DB sync.
- `/Users/robert.sawyer/Git/messagevault/app/layout.tsx` — Root layout sets `<html lang="en" className="dark">`. The hardcoded `dark` class is the initial state; `ThemeToggle` overrides on mount from localStorage.
- `/Users/robert.sawyer/Git/messagevault/components/shared/page-header.tsx` — `PageHeader` component for consistent page headers.

### Existing Chat Integration

The chat system reads user preferences to set model defaults:
- Chat session creation likely reads from `users.preferences.defaultModel` and `users.preferences.thinkingEnabled`
- Changing preferences should affect *new* chat sessions (not existing ones)

### Existing Patterns

- Forms follow: `Label` + `Input`/`Select` pattern with consistent `max-w-md` widths
- No toast system is currently installed — need to add `sonner`
- No `Switch` component installed — need to add it
- Tabs component is available (`components/ui/tabs.tsx`)

## 3. Detailed Step-by-Step Implementation

### Step 1: Add Mutations to `convex/users.ts`

**File:** `/Users/robert.sawyer/Git/messagevault/convex/users.ts`

**Changes:** Add `updateProfile` and `updatePreferences` mutations after the existing `ensureUser` mutation.

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

// ... existing currentUser query and ensureUser mutation ...

/**
 * Update the user's profile fields (display name and real name).
 */
export const updateProfile = mutation({
  args: {
    displayName: v.string(),
    realName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await ctx.db.patch(userId as any, {
      displayName: args.displayName,
      realName: args.realName,
    });
  },
});

/**
 * Update the user's app preferences (model, thinking, theme).
 * Replaces the entire preferences object.
 */
export const updatePreferences = mutation({
  args: {
    defaultModel: v.string(),
    thinkingEnabled: v.boolean(),
    theme: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await ctx.db.patch(userId as any, {
      preferences: {
        defaultModel: args.defaultModel,
        thinkingEnabled: args.thinkingEnabled,
        theme: args.theme,
      },
    });
  },
});
```

**Why:** Profile and preferences are separate mutations because they represent distinct user actions (save profile vs. save preferences). Convex patches nested objects by full replacement, so `updatePreferences` takes all three fields.

**Edge cases:**
- `getUserId` will throw if not authenticated — handled by Convex error boundary
- Empty strings: validate on the frontend that displayName is non-empty before calling

**Verify:** Call mutations from Convex dashboard. Verify user record updates correctly.

### Step 2: Install shadcn/ui Switch and Sonner

**Commands:**
```bash
pnpm dlx shadcn@latest add switch
pnpm dlx shadcn@latest add sonner
```

**Post-install:** Add `<Toaster />` from sonner to the app layout.

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/layout.tsx`

Add import and render `<Toaster />` inside the layout, after `<main>`:

```typescript
import { Toaster } from "sonner";

// ... in the return JSX, after </main>:
<Toaster position="bottom-right" theme="dark" />
```

**Why:** Switch is needed for the thinking toggle. Sonner provides toast notifications for save feedback. The Toaster component must be in the provider tree to display toasts.

**Verify:** `components/ui/switch.tsx` exists after install. Toast notifications work when calling `toast.success()`.

### Step 3: Create Profile Settings Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/profile-settings.tsx` (new file)

```typescript
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

  // Initialize form when user data loads
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
            Used to identify your messages during import. This maps to the "Me" identity in conversations.
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
```

**Why:** Profile settings let users set their display name (shown in the app) and real name (used for "Me" identity during import). The form tracks dirty state to enable/disable the save button.

**Edge cases:**
- User data loading: show skeleton
- Empty display name: validation error toast
- Network error on save: error toast

**Verify:** Edit display name → save → refresh page → verify name persisted. Edit real name → verify in Convex dashboard.

### Step 4: Create AI Settings Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/ai-settings.tsx` (new file)

```typescript
// ABOUTME: AI preferences settings — default model selector and thinking toggle.
// ABOUTME: These preferences apply to newly created chat sessions.

"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const MODELS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6", description: "Most capable" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Fast & capable" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Fastest" },
];

export function AISettings() {
  const user = useQuery(api.users.currentUser);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setModel(user.preferences.defaultModel);
      setThinkingEnabled(user.preferences.thinkingEnabled);
    }
  }, [user]);

  if (user === undefined) {
    return <AISettingsSkeleton />;
  }

  const hasChanges =
    user &&
    (model !== user.preferences.defaultModel ||
      thinkingEnabled !== user.preferences.thinkingEnabled);

  async function handleSave() {
    setIsSaving(true);
    try {
      await updatePreferences({
        defaultModel: model,
        thinkingEnabled,
        theme: user!.preferences.theme, // preserve current theme
      });
      toast.success("AI preferences updated");
    } catch {
      toast.error("Failed to update preferences");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Preferences</CardTitle>
        <CardDescription>Default settings for new chat sessions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="model">Default Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                  <span className="ml-2 text-muted-foreground">— {m.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between max-w-md">
          <div className="space-y-0.5">
            <Label htmlFor="thinking">Extended Thinking</Label>
            <p className="text-xs text-muted-foreground">
              Shows Claude's reasoning process in chat responses
            </p>
          </div>
          <Switch
            id="thinking"
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

function AISettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-6 w-full max-w-md" />
        <Skeleton className="h-9 w-20" />
      </CardContent>
    </Card>
  );
}
```

**Why:** AI preferences let users choose their default model and thinking toggle for new chat sessions. The `updatePreferences` mutation replaces the entire preferences object, so we must pass the current `theme` value to avoid overwriting it.

**Edge cases:**
- Must preserve `theme` field when saving AI preferences (since `updatePreferences` replaces the full object)
- Model IDs must match what the chat system expects: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`

**Verify:** Change model → save → create new chat session → verify it uses the selected model.

### Step 5: Create Appearance Settings Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/appearance-settings.tsx` (new file)

```typescript
// ABOUTME: Appearance settings — theme selector with dark, light, and system modes.
// ABOUTME: Theme changes apply immediately via CSS class and sync to database.

"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const THEMES = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
] as const;

function applyTheme(theme: string) {
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", prefersDark);
  } else {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
  localStorage.setItem("messagevault-theme", theme);
}

export function AppearanceSettings() {
  const user = useQuery(api.users.currentUser);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    if (user) {
      setTheme(user.preferences.theme);
    }
  }, [user]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  async function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    applyTheme(newTheme);

    if (user) {
      try {
        await updatePreferences({
          defaultModel: user.preferences.defaultModel,
          thinkingEnabled: user.preferences.thinkingEnabled,
          theme: newTheme,
        });
      } catch {
        toast.error("Failed to save theme preference");
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose your preferred theme</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleThemeChange(t.value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
                theme === t.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              <t.icon className="h-5 w-5" />
              <span className="text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Why:** Theme selector provides immediate visual feedback. Changes are applied instantly via CSS class toggle and persisted to both localStorage (for instant load next time) and database (for cross-device sync). The "system" mode respects OS preferences via `matchMedia`.

**Edge cases:**
- System mode: must listen for OS preference changes with `matchMedia` event listener and clean up on unmount
- Theme change during save: optimistic — apply immediately, save async. If save fails, theme stays applied locally (acceptable).
- Must preserve `defaultModel` and `thinkingEnabled` when saving theme change

**Verify:** Switch each theme → verify immediate visual change. Refresh page → verify persisted. System mode → change OS preference → verify theme follows.

### Step 6: Compose Settings Page with Tabs

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx` (replace entirely)

```typescript
// ABOUTME: Settings page — tabbed interface for profile, participants, and data management.
// ABOUTME: General tab has profile, AI, and appearance settings. Other tabs are populated by G3/G4.

"use client";

import { Users, Database } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { AISettings } from "@/components/settings/ai-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { EmptyState } from "@/components/shared/empty-state";

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
            <AISettings />
            <AppearanceSettings />
          </TabsContent>

          <TabsContent value="participants" className="mt-6">
            {/* G3 will replace this placeholder */}
            <EmptyState
              icon={Users}
              title="Participant Management"
              description="View, edit, and merge participants across your conversations."
            />
          </TabsContent>

          <TabsContent value="data" className="mt-6">
            {/* G4 will replace this placeholder */}
            <EmptyState
              icon={Database}
              title="Data Management"
              description="View import history, manage conversations, and check storage usage."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

**Why:** The Tabs structure is created now with G2 so that G3 and G4 can simply replace the placeholder content in their respective tabs. The "General" tab contains all G2 settings components.

**Edge cases:**
- Tab state is ephemeral (URL doesn't change with tab selection). If users need deep-linkable tabs, add `?tab=participants` URL param support later.

**Verify:** All three tabs render. General tab shows Profile, AI, and Appearance settings. Participants and Data tabs show placeholders.

### Step 7: Update ThemeToggle for System Preference Sync

**File:** `/Users/robert.sawyer/Git/messagevault/components/shell/theme-toggle.tsx`

**Changes:** Extend the existing toggle to:
1. Support "system" theme mode (reads from localStorage, respects OS preference)
2. Cycle through: dark → light → system → dark
3. Show Monitor icon for system mode

```typescript
"use client";

// ABOUTME: Dark/light/system theme toggle button for the topbar.
// ABOUTME: Cycles through dark → light → system, persists to localStorage.

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Theme = "dark" | "light" | "system";

function getEffectiveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("messagevault-theme") as Theme | null;
    if (stored && ["dark", "light", "system"].includes(stored)) {
      setTheme(stored);
      const effective = getEffectiveTheme(stored);
      document.documentElement.classList.toggle("dark", effective === "dark");
    }
  }, []);

  // Listen for system preference changes when in system mode
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

  function handleToggle() {
    const cycle: Record<Theme, Theme> = {
      dark: "light",
      light: "system",
      system: "dark",
    };
    const next = cycle[theme];
    setTheme(next);
    const effective = getEffectiveTheme(next);
    document.documentElement.classList.toggle("dark", effective === "dark");
    localStorage.setItem("messagevault-theme", next);
  }

  const icons: Record<Theme, typeof Moon> = {
    dark: Sun,
    light: Moon,
    system: Monitor,
  };
  const labels: Record<Theme, string> = {
    dark: "Light mode",
    light: "System mode",
    system: "Dark mode",
  };

  const Icon = icons[theme];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={handleToggle}>
          <Icon className="h-4 w-4" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{labels[theme]}</TooltipContent>
    </Tooltip>
  );
}
```

**Why:** The existing toggle only supports dark/light. Extending to support "system" mode aligns it with the settings page's appearance section. Both use the same localStorage key, so changes in either location stay in sync.

**Edge cases:**
- Tooltip label shows what the *next* click will do (not the current state)
- System mode on OS without dark mode preference support: defaults to light

**Verify:** Click toggle → cycles through dark → light → system. System mode follows OS preference. Setting matches what appears in Settings > Appearance.

## 4. Testing Strategy

- **Profile:** Edit display name → save → refresh → verify persisted. Edit real name → verify in Convex dashboard.
- **AI Model:** Change model → save → start new chat session → verify it uses the new default.
- **Thinking toggle:** Toggle thinking → save → start new chat → verify thinking state.
- **Theme:** Switch to light → verify immediate visual change. Switch to system → change OS preference → verify theme follows. Refresh page → verify theme persisted.
- **Theme sync:** Change theme in Settings → verify topbar toggle icon matches. Change theme via topbar toggle → navigate to Settings → verify selection matches.
- **Toast notifications:** Verify success toasts appear on save. Verify error toast on validation failure.
- **Tabs:** Switch between General / Participants / Data tabs. Verify content renders.
- **Type check:** Run `pnpm build` to verify no TypeScript errors.

## 5. Validation Checklist

- [ ] Profile edits (displayName, realName) save and persist across page loads
- [ ] Empty display name is blocked with error toast
- [ ] AI model selector shows all 3 options with descriptions
- [ ] Model preference persists and affects new chat sessions
- [ ] Thinking toggle persists and affects new chat sessions
- [ ] Theme dark/light/system all apply immediately
- [ ] Theme persists to localStorage and database
- [ ] System theme follows OS preference and updates live
- [ ] Topbar ThemeToggle cycles through dark → light → system
- [ ] Settings and topbar theme toggle stay in sync
- [ ] Success toast appears on save
- [ ] Loading state shown during save
- [ ] Save button disabled when no changes made
- [ ] Settings page has 3 tabs: General, Participants, Data
- [ ] Participants and Data tabs show placeholder EmptyStates
- [ ] Switch and Sonner components installed correctly
- [ ] `<Toaster />` added to app layout
- [ ] No TypeScript errors (`pnpm build`)

## 6. Potential Issues & Mitigations

- **Theme flicker on page load:** Root layout hardcodes `className="dark"`. On mount, ThemeToggle reads localStorage and may remove `dark` class, causing a flash. This is the standard approach for client-side theme toggling. For a flicker-free experience, a `<script>` tag in `<head>` could read localStorage before render — but this is a v2 optimization.
- **Preferences mutation replaces full object:** `updatePreferences` replaces the entire `preferences` object. When saving AI settings, must include the current theme. When saving theme, must include current model/thinking. Each component reads the current user data to preserve other fields.
- **Sonner provider placement:** `<Toaster />` must be within the component tree. Adding to `app/(app)/layout.tsx` scopes it to authenticated routes (which is correct — no toasts needed on the landing page).
- **React Compiler and inline functions:** The codebase has React Compiler enabled. Avoid inline arrow functions as event handlers in performance-sensitive contexts. The settings page has minimal re-renders so this is not a concern here.

## 7. Assumptions & Dependencies

- **`users.currentUser` query** returns the full user object including `preferences` (confirmed — line 11-25 of `convex/users.ts`)
- **`getUserId(ctx)` returns user `_id`** which can be used with `ctx.db.patch()` (confirmed — `convex/lib/auth.ts`)
- **Schema `preferences` field** uses `v.object()` requiring full replacement on patch (confirmed — `convex/schema.ts` line 13-17)
- **Tabs component** is installed (`components/ui/tabs.tsx`) (confirmed)
- **`pnpm dlx shadcn@latest add switch sonner`** will install correctly (standard shadcn/ui installation)
- **Existing ThemeToggle** uses `messagevault-theme` localStorage key (confirmed — `components/shell/theme-toggle.tsx` line 19)
- **Chat system** reads `preferences.defaultModel` and `preferences.thinkingEnabled` for new sessions (will affect new sessions only)
