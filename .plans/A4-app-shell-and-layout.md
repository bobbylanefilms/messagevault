# A4: App Shell and Layout — Execution Plan

## 1. Problem Summary

**What:** Build the persistent app shell (topbar + collapsible sidebar) and create all route placeholder pages so users can navigate the authenticated app.

**Why:** After A3 (auth), authenticated users land on a bare `/dashboard` page with no navigation. There's no way to reach any other route. A4 creates the navigational skeleton that all subsequent features (B1–G4) build within.

**Success criteria:**
- Authenticated user sees a topbar with logo, search/import shortcuts, and Clerk UserButton
- Collapsible sidebar with MESSAGES placeholder, VIEWS nav (Dashboard, Calendar, Search, AI Chat), and utility links (Import, Settings)
- All 10 routes render placeholder pages reachable via sidebar navigation
- Active route is visually highlighted in the sidebar
- Sidebar collapses to icon-only rail on desktop; slides in as Sheet overlay on mobile (<768px)
- Dark mode is on by default with a toggle available in the topbar

---

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Status |
|------|---------|--------|
| `app/(authenticated)/layout.tsx` | Auth guard + children render | Rename to `(app)`, rewrite to compose shell |
| `app/(authenticated)/dashboard/page.tsx` | Dashboard placeholder | Update styling for shell context |
| `app/layout.tsx` | Root layout with provider stack | No changes needed |
| `app/globals.css` | Tailwind 4.2 `@theme` block | Add sidebar color tokens |
| `app/page.tsx` | Landing/sign-in page | No changes needed |
| `components/providers/convex-client-provider.tsx` | Clerk + Convex providers | No changes needed |
| `components/ui/sheet.tsx` | shadcn Sheet (supports `side="left"`) | Reuse for mobile sidebar |
| `components/ui/tooltip.tsx` | shadcn Tooltip | Reuse for collapsed sidebar labels |
| `components/ui/button.tsx` | shadcn Button | Reuse throughout shell |
| `components/ui/scroll-area.tsx` | shadcn ScrollArea | Reuse for sidebar overflow |
| `components/ui/separator.tsx` | shadcn Separator | Reuse for sidebar section dividers |
| `lib/utils.ts` | `cn()` class merge utility | Reuse |
| `convex/users.ts` | `ensureUser` mutation, `currentUser` query | Already used by auth layout |

### Existing Patterns to Follow

- **ABOUTME comments:** Every file starts with two `// ABOUTME:` lines
- **`"use client"`** on any component using hooks (Clerk, Zustand, usePathname)
- **Server components** for placeholder pages that don't need client hooks
- **Tailwind 4.2 CSS-first:** Theme tokens defined as `--color-*` in `@theme {}` block in `globals.css`
- **shadcn/ui imports:** Components import from `@/components/ui/*`
- **Zustand stores:** Named with `use` prefix, live in `lib/stores/`

### Dependencies Already Installed

- `lucide-react` v0.577.0 — icons
- `zustand` v5.0.12 — state management
- `@clerk/nextjs` v7.0.6 — `UserButton` component
- All needed shadcn/ui components (Button, Sheet, Tooltip, ScrollArea, Separator, Skeleton)

### Directories That Must Be Created

- `lib/stores/` — does not exist yet
- `components/shell/` — does not exist yet
- All `app/(app)/` route directories

---

## 3. Detailed Step-by-Step Implementation

### Step 1: Rename route group `(authenticated)` → `(app)`

**Command:**
```bash
mv app/\(authenticated\) app/\(app\)
```

**Why:** User confirmed this rename for brevity. Route groups are filesystem-only — no URLs change, no import paths reference the directory name.

**After rename, update ABOUTME comments in `app/(app)/layout.tsx`:**
Change line 1 from:
```
// ABOUTME: Authenticated route group layout — protects all child routes from unauthenticated access.
```
to:
```
// ABOUTME: App shell layout — auth guard, top bar, collapsible sidebar, and main content area.
```

**Verify:** Run `pnpm dev --port 3002`, navigate to `localhost:3002`, sign in, confirm `/dashboard` still loads with auth protection.

---

### Step 2: Add sidebar theme tokens to `globals.css`

**File:** `/Users/robert.sawyer/Git/messagevault/app/globals.css`

**Add these lines inside the existing `@theme {}` block, after the `--color-ring` line (line 29) and before `--color-bubble-me`:**

```css
  --color-sidebar: oklch(0.11 0.01 260);
  --color-sidebar-foreground: oklch(0.95 0.01 260);
  --color-sidebar-primary: oklch(0.65 0.2 250);
  --color-sidebar-primary-foreground: oklch(0.98 0.01 260);
  --color-sidebar-accent: oklch(0.18 0.015 260);
  --color-sidebar-accent-foreground: oklch(0.95 0.01 260);
  --color-sidebar-border: oklch(0.22 0.01 260);
  --color-sidebar-muted-foreground: oklch(0.55 0.01 260);
  --color-sidebar-ring: oklch(0.65 0.2 250);

  --sidebar-width: 16rem;
  --sidebar-width-collapsed: 3.5rem;
```

**Why:** Sidebar background (0.11) is slightly darker than main background (0.13) to create subtle depth. The accent color (0.18) provides gentle hover/active state highlighting. These follow the "warm minimal" design direction.

**Verify:** No visual change yet — tokens are just defined.

---

### Step 3: Create Zustand sidebar store

**File to create:** `/Users/robert.sawyer/Git/messagevault/lib/stores/use-sidebar-store.ts`

```typescript
// ABOUTME: Zustand store for sidebar UI state — collapsed state and mobile open state.
// ABOUTME: Ephemeral UI state only; not persisted to database.

import { create } from "zustand";

interface SidebarState {
  isCollapsed: boolean;
  isMobileOpen: boolean;
}

interface SidebarActions {
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setMobileOpen: (open: boolean) => void;
}

export type SidebarStore = SidebarState & SidebarActions;

export const useSidebarStore = create<SidebarStore>((set) => ({
  isCollapsed: false,
  isMobileOpen: false,
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
  setMobileOpen: (open) => set({ isMobileOpen: open }),
}));
```

**Why:** Two independent booleans — `isCollapsed` controls desktop rail mode, `isMobileOpen` controls the Sheet overlay. Both components (Sidebar, Topbar) need to read/write this shared state.

**Gotcha — React Compiler:** When consuming this store in components, do NOT use inline arrow selectors like `useSidebarStore((s) => s.isCollapsed)`. Instead, destructure from the full store or define named selector functions outside the component. For a store this small, destructuring is fine:
```typescript
const { isCollapsed, toggleCollapsed } = useSidebarStore();
```

**Verify:** File compiles — will be tested when consumed by shell components.

---

### Step 4: Create the Sidebar component

**File to create:** `/Users/robert.sawyer/Git/messagevault/components/shell/sidebar.tsx`

```typescript
"use client";

// ABOUTME: App sidebar — primary navigation with conversation list placeholder and view links.
// ABOUTME: Collapsible on desktop (rail mode shows icons only), rendered in Sheet on mobile.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Search,
  Bot,
  Upload,
  Settings,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarStore } from "@/lib/stores/use-sidebar-store";

const viewNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/search", label: "Search", icon: Search },
  { href: "/chat", label: "AI Chat", icon: Bot },
] as const;

const utilityNavItems = [
  { href: "/import", label: "Import", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  isCollapsed: boolean;
}

function NavItem({ href, label, icon: Icon, isActive, isCollapsed }: NavItemProps) {
  const linkContent = (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        isCollapsed && "justify-center px-2"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-sidebar-primary" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span>{label}</span>}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        className={cn(
          "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out",
          isCollapsed ? "w-[var(--sidebar-width-collapsed)]" : "w-[var(--sidebar-width)]"
        )}
      >
        {/* Messages section */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className={cn("px-3 py-4", isCollapsed && "px-2")}>
              {!isCollapsed && (
                <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
                  Messages
                </h2>
              )}
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex justify-center py-2">
                      <MessageSquare className="h-4 w-4 text-sidebar-muted-foreground" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    Messages
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="px-3 py-6 text-center text-xs text-sidebar-muted-foreground">
                  Import conversations to see them here
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Views section */}
        <div className={cn("px-3 py-4", isCollapsed && "px-2")}>
          {!isCollapsed && (
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
              Views
            </h2>
          )}
          <div className="space-y-1">
            {viewNavItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActiveRoute(pathname, item.href)}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Utility links */}
        <div className={cn("px-3 py-4", isCollapsed && "px-2")}>
          <div className="space-y-1">
            {utilityNavItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActiveRoute(pathname, item.href)}
                isCollapsed={isCollapsed}
              />
            ))}
          </div>
        </div>

        {/* Collapse toggle */}
        <div className={cn("border-t border-sidebar-border p-3", isCollapsed && "p-2")}>
          <Button
            variant="ghost"
            size={isCollapsed ? "icon" : "sm"}
            onClick={toggleCollapsed}
            className={cn(
              "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isCollapsed ? "w-full justify-center" : "w-full justify-start gap-3"
            )}
          >
            {isCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </nav>
    </TooltipProvider>
  );
}
```

**Design decisions:**
- Active route gets a 2px blue accent bar on the left edge (warm minimal style)
- Hover states use 50% opacity of the accent background for soft transitions
- `/dashboard` uses exact match; all others use `startsWith` (so `/browse/123` highlights Browse)
- Collapsed state hides all text, shows only icons with tooltips
- Messages section is `flex-1` (takes remaining space) — ready for conversation list in C1
- `transition-[width]` for smooth collapse animation

---

### Step 5: Create the Mobile Sidebar wrapper

**File to create:** `/Users/robert.sawyer/Git/messagevault/components/shell/mobile-sidebar.tsx`

```typescript
"use client";

// ABOUTME: Mobile sidebar — wraps the Sidebar component in a Sheet for narrow viewports.
// ABOUTME: Controlled by the sidebar Zustand store's isMobileOpen state.

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/shell/sidebar";
import { useSidebarStore } from "@/lib/stores/use-sidebar-store";
import { VisuallyHidden } from "radix-ui";

export function MobileSidebar() {
  const { isMobileOpen, setMobileOpen } = useSidebarStore();

  return (
    <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-[var(--sidebar-width)] p-0 bg-sidebar border-sidebar-border" showCloseButton={false}>
        <VisuallyHidden.Root>
          <SheetTitle>Navigation</SheetTitle>
        </VisuallyHidden.Root>
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
```

**Why:** The Sheet wraps the same `Sidebar` component. The sidebar reads its own state — on mobile, `isCollapsed` will be false (default), so it shows expanded. `VisuallyHidden` around `SheetTitle` satisfies accessibility requirements without showing a visible title.

**Gotcha:** The `VisuallyHidden` component is available from `radix-ui` (the unified package already installed). If the import doesn't resolve, try `import * as VisuallyHidden from "@radix-ui/react-visually-hidden"` — check what's available in `node_modules`. The shadcn Sheet component requires a `SheetTitle` for accessibility; hiding it visually is the standard pattern.

**Auto-close on navigation:** The Sheet's `onOpenChange` callback handles closing when the user clicks outside. For closing on nav link click, add an `onClick` handler on the `SheetContent` that checks if the click target is a link:

```typescript
<SheetContent
  side="left"
  className="..."
  showCloseButton={false}
  onClick={(e) => {
    if ((e.target as HTMLElement).closest("a")) {
      setMobileOpen(false);
    }
  }}
>
```

---

### Step 6: Create the Topbar component

**File to create:** `/Users/robert.sawyer/Git/messagevault/components/shell/topbar.tsx`

```typescript
"use client";

// ABOUTME: Top navigation bar — logo, search shortcut, import button, and Clerk UserButton.
// ABOUTME: Persistent across all authenticated routes; includes mobile menu trigger.

import Link from "next/link";
import { Menu, Search, Upload } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebarStore } from "@/lib/stores/use-sidebar-store";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export function Topbar() {
  const { setMobileOpen } = useSidebarStore();

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        {/* Left: mobile menu + logo */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-muted-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            MessageVault
          </Link>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/search">
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Search</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild>
                <Link href="/import">
                  <Upload className="h-4 w-4" />
                  <span className="sr-only">Import</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import conversations</TooltipContent>
          </Tooltip>

          <ThemeToggle />

          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
    </TooltipProvider>
  );
}
```

**Design decisions:**
- Height `h-14` (56px) — standard for app topbars
- `shrink-0` prevents the topbar from collapsing in the flex layout
- Mobile hamburger hidden on `md:` and above
- Gap between action buttons is `gap-1` for tight grouping
- Clerk `UserButton` with `afterSignOutUrl="/"` redirects to landing on sign out

---

### Step 7: Create ThemeToggle component

**File to create:** `/Users/robert.sawyer/Git/messagevault/components/shell/theme-toggle.tsx`

```typescript
"use client";

// ABOUTME: Dark/light mode toggle button for the topbar.
// ABOUTME: Toggles the 'dark' class on <html> and persists preference to localStorage.

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("messagevault-theme");
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
  }, []);

  function handleToggle() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("messagevault-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("messagevault-theme", "light");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={handleToggle}>
          {isDark ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
  );
}
```

**Why:** Simple localStorage-based toggle. The Convex `users.preferences.theme` persistence will be wired up in G2 (Settings project). This is sufficient for A4.

**Note on light mode:** The current `globals.css` only defines dark theme colors. Light mode will look wrong until light theme tokens are added (G2 scope). The toggle exists and works mechanically, but the visual result in light mode will be rough. This is expected for A4.

---

### Step 8: Rewrite `(app)/layout.tsx` as the shell

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/layout.tsx`

**Replace the entire file with:**

```typescript
// ABOUTME: App shell layout — auth guard, top bar, collapsible sidebar, and main content area.
// ABOUTME: Wraps all authenticated routes with persistent navigation chrome.

"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Topbar } from "@/components/shell/topbar";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const ensureUser = useMutation(api.users.ensureUser);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      ensureUser().catch(() => {
        // User already exists — this is expected on subsequent loads
      });
    }
  }, [isLoaded, isSignedIn, ensureUser]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar />
        </div>
        <MobileSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**Key changes from current file:**
- Renamed function from `AuthenticatedLayout` to `AppLayout`
- Updated ABOUTME comments
- Added Topbar, Sidebar, MobileSidebar imports and composition
- Changed loading state from `min-h-screen` to `h-screen` (consistent with shell)
- Structure: Topbar at top (full width) → flex row below with Sidebar (desktop only) + main content

---

### Step 9: Update Dashboard placeholder

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/dashboard/page.tsx`

**Replace entire file with:**

```typescript
// ABOUTME: Dashboard placeholder page — will be built out in G1.
// ABOUTME: Serves as the post-login landing page for authenticated users.

import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Welcome to MessageVault. Your message archive overview will appear here.
        </p>
      </div>
    </div>
  );
}
```

**Changes:** Removed `<main>` wrapper (shell provides it), changed `min-h-screen` to `h-full`, added icon for visual consistency with other placeholders.

---

### Step 10: Create all placeholder pages

All placeholder pages follow this template pattern — server components (no `"use client"`), two ABOUTME lines, centered content with relevant icon, title, and description.

**Important Next.js 16 note:** Dynamic route pages receive `params` as a Promise. Use `async` function + `await params`.

**a) `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/page.tsx`**

```typescript
// ABOUTME: Browse conversations placeholder — will be built in C1.
// ABOUTME: Will redirect to most recent conversation; currently shows empty state.

import { MessageSquare } from "lucide-react";

export default function BrowsePage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Browse Conversations</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Select a conversation from the sidebar to start reading.
        </p>
      </div>
    </div>
  );
}
```

**b) `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/[conversationId]/page.tsx`**

```typescript
// ABOUTME: Conversation thread placeholder — will be built in C2.
// ABOUTME: Will show iMessage-style message bubbles with virtualized scrolling.

import { MessageSquare } from "lucide-react";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Conversation</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Message thread view will appear here.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/50">{conversationId}</p>
      </div>
    </div>
  );
}
```

**c) `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/page.tsx`**

```typescript
// ABOUTME: Calendar heatmap placeholder — will be built in D1.
// ABOUTME: Will show GitHub-style activity grid of message history.

import { Calendar } from "lucide-react";

export default function CalendarPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          A GitHub-style heatmap of your message activity will appear here.
        </p>
      </div>
    </div>
  );
}
```

**d) `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/[dateKey]/page.tsx`**

```typescript
// ABOUTME: Calendar day detail placeholder — will be built in D3.
// ABOUTME: Will show all messages from a specific day grouped by conversation.

import { Calendar } from "lucide-react";

export default async function CalendarDayPage({
  params,
}: {
  params: Promise<{ dateKey: string }>;
}) {
  const { dateKey } = await params;

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Calendar className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Day Detail</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          All messages from {dateKey} will appear here.
        </p>
      </div>
    </div>
  );
}
```

**e) `/Users/robert.sawyer/Git/messagevault/app/(app)/search/page.tsx`**

```typescript
// ABOUTME: Search placeholder — will be built in E4.
// ABOUTME: Will provide hybrid keyword + semantic search across all conversations.

import { Search } from "lucide-react";

export default function SearchPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Search className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Search</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Search across all your conversations with keywords and semantic understanding.
        </p>
      </div>
    </div>
  );
}
```

**f) `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/page.tsx`**

```typescript
// ABOUTME: AI Chat placeholder — will be built in F4.
// ABOUTME: Will provide RAG-powered conversational interface for exploring message history.

import { Bot } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Bot className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">AI Chat</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Ask questions about your message archive using AI.
        </p>
      </div>
    </div>
  );
}
```

**g) `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/[sessionId]/page.tsx`**

```typescript
// ABOUTME: Chat session placeholder — will be built in F4.
// ABOUTME: Will show a specific AI conversation with streaming responses.

import { Bot } from "lucide-react";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Bot className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Chat Session</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Your conversation with the AI will appear here.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/50">{sessionId}</p>
      </div>
    </div>
  );
}
```

**h) `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx`**

```typescript
// ABOUTME: Import placeholder — will be built in B1.
// ABOUTME: Will provide drag-and-drop upload for Apple Messages markdown exports.

import { Upload } from "lucide-react";

export default function ImportPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Import Conversations</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Drag and drop your Apple Messages exports to get started.
        </p>
      </div>
    </div>
  );
}
```

**i) `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx`**

```typescript
// ABOUTME: Settings placeholder — will be built in G2.
// ABOUTME: Will provide profile management, participant editing, and preferences.

import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center">
        <Settings className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Manage your profile, participants, and preferences.
        </p>
      </div>
    </div>
  );
}
```

---

## 4. Testing Strategy

### Type Check
```bash
# Stop dev server first if running
pnpm build
```
Expected: No TypeScript errors. All imports resolve.

### Browser Verification (manual or via MCP)

1. **Auth flow:** Navigate to `localhost:3002` → sign in → should redirect to `/dashboard` with full shell visible (topbar + sidebar + placeholder content)

2. **Navigation:** Click each sidebar link in order:
   - Dashboard → `/dashboard` (active highlight)
   - Calendar → `/calendar` (placeholder)
   - Search → `/search` (placeholder)
   - AI Chat → `/chat` (placeholder)
   - Import → `/import` (placeholder)
   - Settings → `/settings` (placeholder)

3. **Topbar actions:**
   - Click search icon → navigates to `/search`
   - Click import icon → navigates to `/import`
   - Theme toggle → switches dark/light class on `<html>`
   - Clerk UserButton → shows dropdown, sign out returns to `/`

4. **Sidebar collapse:**
   - Click "Collapse" button → sidebar narrows to icon-only rail
   - Hover icons → tooltips appear with labels
   - Active route highlight still visible
   - Click expand → returns to full sidebar

5. **Mobile responsive:**
   - Resize browser to <768px → sidebar disappears, hamburger appears in topbar
   - Click hamburger → Sheet slides in from left with full sidebar
   - Click a nav link → Sheet closes, navigates to route

6. **Dynamic routes:**
   - Navigate to `/browse/test-id` → shows placeholder with "test-id" displayed
   - Navigate to `/calendar/2024-01-15` → shows placeholder with date
   - Navigate to `/chat/session-123` → shows placeholder with session ID

---

## 5. Validation Checklist

- [ ] Route group renamed from `(authenticated)` to `(app)` — auth guard preserved
- [ ] Sidebar theme tokens added to `globals.css` `@theme` block
- [ ] Zustand sidebar store created at `lib/stores/use-sidebar-store.ts`
- [ ] Sidebar component renders with MESSAGES, VIEWS, and utility sections
- [ ] Active route highlighted with accent bar and background
- [ ] Sidebar collapse/expand works with smooth width transition
- [ ] Collapsed sidebar shows icons only with tooltips
- [ ] Mobile Sheet sidebar opens/closes from hamburger menu
- [ ] Sheet auto-closes when nav link is clicked
- [ ] Topbar shows logo, search, import, theme toggle, and UserButton
- [ ] All 10 routes render placeholder pages (dashboard, browse, browse/[id], calendar, calendar/[date], search, chat, chat/[id], import, settings)
- [ ] Dynamic route pages display their params
- [ ] Theme toggle switches dark/light mode and persists to localStorage
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] Every new file has two ABOUTME comment lines
- [ ] No `"use client"` on server-component placeholder pages
- [ ] `"use client"` present on all shell components (sidebar, topbar, mobile-sidebar, theme-toggle)

---

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| `VisuallyHidden` import fails from `radix-ui` | TypeScript error on build | Try `import { VisuallyHidden } from "radix-ui"` or check node_modules for exact export path. May need `@radix-ui/react-visually-hidden` as separate import. |
| Sidebar width transition causes content layout jumps | Visual jank during collapse animation | Add `overflow-hidden` on the sidebar nav container. The `transition-[width]` only animates width, not content reflow. |
| Clerk UserButton doesn't render | Blank space in topbar | Ensure `@clerk/nextjs` is imported (not `@clerk/clerk-react`). The provider is already in the root layout via ConvexClientProvider. |
| Sheet content doesn't match sidebar background | Visual mismatch | Ensure `bg-sidebar` class is on SheetContent. The `--color-sidebar` token must be defined in globals.css first (Step 2). |
| Next.js 16 `params` not awaited | Build error or runtime error | Dynamic route pages MUST use `async function` + `await params`. This is a Next.js 16 breaking change from earlier versions. |
| React Compiler warns about Zustand selectors | Console warnings | Don't use inline arrow selectors. Destructure from the full store instead: `const { isCollapsed } = useSidebarStore()`. |
| Light mode colors look broken | Theme toggle reveals unstyled light mode | Expected for A4. The `@theme` block only defines dark colors. Full light theme is G2 scope. |

---

## 7. Assumptions & Dependencies

### Prerequisites (must be true)
- A1, A2, A3 are complete and working (project setup, schema, auth)
- `pnpm convex dev` and `pnpm dev --port 3002` can run successfully
- Clerk authentication is functional (sign in/out works)
- `ensureUser` mutation creates user records on first auth

### No new packages needed
All dependencies are already installed: `lucide-react`, `zustand`, `@clerk/nextjs`, shadcn/ui components (Button, Sheet, Tooltip, ScrollArea, Separator, Skeleton).

### Decisions baked in
- Route group name: `(app)` (user confirmed)
- Design direction: warm minimal (user confirmed)
- Sidebar state: Zustand (not React state) — allows both Sidebar and Topbar to share state
- Theme toggle: localStorage only for A4 — Convex persistence deferred to G2
- Browse route nav item: NOT in the sidebar's VIEWS section — conversations will appear in the MESSAGES section (C1). The `/browse` route is accessed by clicking a conversation, not from the nav.

### File creation summary

**14 new files:**
- `lib/stores/use-sidebar-store.ts`
- `components/shell/sidebar.tsx`
- `components/shell/mobile-sidebar.tsx`
- `components/shell/topbar.tsx`
- `components/shell/theme-toggle.tsx`
- `app/(app)/browse/page.tsx`
- `app/(app)/browse/[conversationId]/page.tsx`
- `app/(app)/calendar/page.tsx`
- `app/(app)/calendar/[dateKey]/page.tsx`
- `app/(app)/search/page.tsx`
- `app/(app)/chat/page.tsx`
- `app/(app)/chat/[sessionId]/page.tsx`
- `app/(app)/import/page.tsx`
- `app/(app)/settings/page.tsx`

**3 modified files:**
- `app/globals.css` (add sidebar tokens)
- `app/(app)/layout.tsx` (rewrite with shell composition)
- `app/(app)/dashboard/page.tsx` (adjust for shell context)

**1 renamed directory:**
- `app/(authenticated)/` → `app/(app)/`
