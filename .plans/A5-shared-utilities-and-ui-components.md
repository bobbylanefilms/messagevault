# A5: Shared Utilities and UI Components

## 1. Problem Summary

Build reusable utilities and UI components shared across multiple features in MessageVault: date/time formatting, message type icons, participant color palette, loading skeletons, error boundary, empty state patterns, and a page header component. These are consumed by 6+ downstream projects (C2, C3, D1, D3, E4, F4).

**Why:** Every subsequent UI project depends on these shared primitives. Without them, downstream projects will duplicate logic or make inconsistent design choices. Building them once, correctly, prevents drift across the app.

**Success criteria:**
- All 7 component/utility files exist and export their public API
- All placeholder pages (`/dashboard`, `/browse`, `/calendar`, `/search`, `/chat`, `/import`, `/settings`) use the new `EmptyState` and `PageHeader` components
- Date utilities produce correct output for edge cases (midnight, year boundaries, relative timestamps)
- Participant colors are visually distinct on the app's dark background
- Loading skeletons match the shape of their target content
- Error boundary catches rendering errors and offers retry
- `pnpm build` passes with no TypeScript errors

---

## 2. Current State Analysis

### Existing Files

- **`/Users/robert.sawyer/Git/messagevault/lib/utils.ts`** — Only contains `cn()` class merger. New utilities go alongside this.
- **`/Users/robert.sawyer/Git/messagevault/components/ui/skeleton.tsx`** — shadcn Skeleton primitive (animated pulse div). Loading skeletons will compose this.
- **`/Users/robert.sawyer/Git/messagevault/app/globals.css`** — Tailwind 4.2 `@theme` block with oklch color system. Participant colors will be added here as CSS custom properties.
- **`/Users/robert.sawyer/Git/messagevault/convex/schema.ts`** — `messageType` is a union of `"text" | "image" | "video" | "link" | "attachment_missing"`. `participants.avatarColor` is a string.
- **`/Users/robert.sawyer/Git/messagevault/components/shell/`** — Sidebar, topbar, mobile-sidebar, theme-toggle (A4 output). Establishes component patterns.
- **`/Users/robert.sawyer/Git/messagevault/app/(app)/*/page.tsx`** — 8 placeholder pages with inline centered empty states (icon + title + description). These will be refactored to use the shared `EmptyState` component.

### Existing Patterns to Follow

- Two-line `ABOUTME:` comment at top of every file
- `"use client"` directive on components using React hooks or browser APIs
- Imports from `@/lib/utils` for `cn()`
- Lucide React for icons (already installed: `lucide-react`)
- shadcn/ui primitives in `components/ui/`
- Feature components in `components/{feature}/`
- Shared stores in `lib/stores/`
- oklch color values throughout the theme

### File Organization (new files)

```
lib/
  date-utils.ts              # Date/time formatting utilities
  participant-colors.ts      # Color palette and assignment
components/
  shared/
    message-type-icon.tsx     # Message type → icon mapping
    skeletons.tsx             # Loading skeleton compositions
    error-boundary.tsx        # React error boundary with retry
    empty-state.tsx           # Empty state pattern component
    page-header.tsx           # Reusable page header
```

### Git State

Single commit on main: `99eef7f A1: Initialize project scaffold`. No branches. A2, A3, A4 have been built but status unclear from tracker (all unchecked). The app shell layout exists at `app/(app)/layout.tsx` with sidebar, topbar, and auth guard.

---

## 3. Detailed Step-by-Step Implementation

### Step 1: Date/Time Formatting Utilities

**File:** `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts`

**Create new file with these exports:**

```typescript
// ABOUTME: Date and time formatting utilities used across MessageVault.
// ABOUTME: Handles relative timestamps, day headers, date keys, and message grouping logic.

/**
 * Convert a Unix timestamp (ms) to an ISO date key string: "2023-01-15"
 */
export function toDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Parse a date key string back to a Date at midnight local time.
 */
export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date key for display as a day header: "Tuesday, January 15, 2023"
 */
export function formatDayHeader(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a timestamp as a short time string: "2:34 PM"
 */
export function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a timestamp as a relative string: "just now", "2m ago", "3h ago",
 * "Yesterday", or "Jan 15" for older.
 */
export function formatRelativeTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  const today = new Date();
  const date = new Date(timestamp);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
}

/**
 * Check if two timestamps fall on the same calendar day (local time).
 */
export function isSameDay(a: number, b: number): boolean {
  return toDateKey(a) === toDateKey(b);
}

/**
 * Check if two timestamps are within N minutes of each other.
 * Used for message grouping (consecutive messages from same sender within 2min).
 */
export function isWithinMinutes(a: number, b: number, minutes: number): boolean {
  return Math.abs(a - b) <= minutes * 60 * 1000;
}

/**
 * Format a date range for display: "Jan 15 – Mar 20, 2023" or
 * "Dec 28, 2022 – Jan 5, 2023" when spanning years.
 */
export function formatDateRange(startTimestamp: number, endTimestamp: number): string {
  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);
  const sameYear = start.getFullYear() === end.getFullYear();

  const startStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(!sameYear && { year: "numeric" }),
  });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${startStr} – ${endStr}`;
}
```

**Why:** Every downstream project that displays messages needs timestamps (C2 for message times, D3 for day headers, E4 for search result timestamps). The `isWithinMinutes` function is critical for C2's message grouping logic. `toDateKey`/`fromDateKey` bridge between Unix timestamps and the `dateKey` field used throughout the schema.

**Edge cases:**
- Year boundaries: `formatRelativeTimestamp` includes year when the message is from a different year
- `formatDateRange` handles cross-year ranges
- `toDateKey` uses local time, matching the import pipeline's behavior

**Verify:** Import and call each function in a test console or write a quick verification. `toDateKey(Date.now())` should return today's date. `formatRelativeTimestamp(Date.now() - 120000)` should return "2m ago".

---

### Step 2: Participant Color Palette

**File:** `/Users/robert.sawyer/Git/messagevault/lib/participant-colors.ts`

**Create new file:**

```typescript
// ABOUTME: Deterministic participant color palette for avatar and bubble colors.
// ABOUTME: 12 distinct oklch colors optimized for dark backgrounds with white/light text.

/**
 * Fixed palette of 12 visually distinct colors for participant identification.
 * All colors use oklch for perceptual uniformity. Designed to:
 * - Be distinct from each other at a glance
 * - Work as bubble backgrounds with white text on dark mode
 * - Avoid collision with the "me" bubble color (blue, oklch(0.45 0.15 250))
 * - Have sufficient contrast on the app background (oklch(0.13 0.01 260))
 */
export const PARTICIPANT_COLORS = [
  "oklch(0.60 0.16 25)",   // coral
  "oklch(0.65 0.16 55)",   // amber
  "oklch(0.62 0.16 85)",   // gold
  "oklch(0.65 0.14 145)",  // emerald
  "oklch(0.62 0.12 175)",  // teal
  "oklch(0.60 0.12 200)",  // cyan
  "oklch(0.55 0.16 275)",  // indigo
  "oklch(0.58 0.18 310)",  // purple
  "oklch(0.60 0.18 340)",  // magenta
  "oklch(0.62 0.16 10)",   // rose
  "oklch(0.58 0.14 120)",  // lime
  "oklch(0.55 0.14 240)",  // steel blue
] as const;

/**
 * Get a participant color by index, wrapping around the palette.
 * Used during import to assign avatarColor to new participants.
 */
export function getParticipantColor(index: number): string {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}

/**
 * The "me" bubble color — defined centrally so C2 and other consumers
 * don't hardcode it independently.
 */
export const ME_BUBBLE_COLOR = "oklch(0.45 0.15 250)";

/**
 * The default "other" bubble color for non-group chats
 * (matches --color-bubble-other in globals.css).
 */
export const OTHER_BUBBLE_COLOR = "oklch(0.25 0.01 260)";
```

**Also update** `/Users/robert.sawyer/Git/messagevault/app/globals.css` to add CSS custom properties for each participant color, enabling Tailwind usage:

Add inside the `@theme { }` block, after the existing `--color-bubble-other` line:

```css
  --color-participant-0: oklch(0.60 0.16 25);
  --color-participant-1: oklch(0.65 0.16 55);
  --color-participant-2: oklch(0.62 0.16 85);
  --color-participant-3: oklch(0.65 0.14 145);
  --color-participant-4: oklch(0.62 0.12 175);
  --color-participant-5: oklch(0.60 0.12 200);
  --color-participant-6: oklch(0.55 0.16 275);
  --color-participant-7: oklch(0.58 0.18 310);
  --color-participant-8: oklch(0.60 0.18 340);
  --color-participant-9: oklch(0.62 0.16 10);
  --color-participant-10: oklch(0.58 0.14 120);
  --color-participant-11: oklch(0.55 0.14 240);
```

**Why:** The schema stores `avatarColor` as a string on each participant. During import (B2/B4), new participants are assigned colors via `getParticipantColor(index)`. The CSS custom properties enable Tailwind classes like `bg-[var(--color-participant-0)]` in downstream components, though most usage will be inline `style={{ backgroundColor: participant.avatarColor }}` since the color comes from the database.

**Edge cases:**
- More than 12 participants: colors wrap around via modulo
- `ME_BUBBLE_COLOR` exported separately so it's never accidentally assigned to a non-"me" participant

**Verify:** Import `PARTICIPANT_COLORS` and confirm the array length is 12. Verify `getParticipantColor(15)` returns the same as `getParticipantColor(3)`.

---

### Step 3: Message Type Icon Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/shared/message-type-icon.tsx`

**Create new file:**

```typescript
// ABOUTME: Maps message types from the schema to their corresponding Lucide icons.
// ABOUTME: Used in browse view, search results, and calendar day detail to indicate content type.

import {
  MessageSquareText,
  ImageIcon,
  Video,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MessageType = "text" | "image" | "video" | "link" | "attachment_missing";

const iconMap: Record<
  MessageType,
  React.ComponentType<{ className?: string }>
> = {
  text: MessageSquareText,
  image: ImageIcon,
  video: Video,
  link: Link2,
  attachment_missing: AlertTriangle,
};

const labelMap: Record<MessageType, string> = {
  text: "Text message",
  image: "Image",
  video: "Video",
  link: "Link",
  attachment_missing: "Missing attachment",
};

interface MessageTypeIconProps {
  type: MessageType;
  className?: string;
  showLabel?: boolean;
}

export function MessageTypeIcon({
  type,
  className,
  showLabel = false,
}: MessageTypeIconProps) {
  const Icon = iconMap[type];
  const label = labelMap[type];

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          type === "attachment_missing"
            ? "text-destructive"
            : "text-muted-foreground",
          className
        )}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </span>
  );
}
```

**Why:** The message type enum appears in every message record. C2 (message thread) shows attachment indicators. E4 (search) has a message type filter. D3 (calendar day detail) needs type indicators. Centralizing the icon mapping prevents each consumer from independently mapping types to icons.

**Edge cases:**
- `attachment_missing` uses destructive color (warning style) since it indicates a problem
- `showLabel` defaults to false for inline use; true for filter dropdowns

**Verify:** Render `<MessageTypeIcon type="image" />` — should show the image icon in muted foreground color. Render with `type="attachment_missing"` — should show warning triangle in destructive color.

---

### Step 4: Loading Skeleton Components

**File:** `/Users/robert.sawyer/Git/messagevault/components/shared/skeletons.tsx`

**Create new file:**

```typescript
// ABOUTME: Composable loading skeleton components matching the shape of real content.
// ABOUTME: Built on top of the shadcn Skeleton primitive for consistent animation.

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Skeleton for a single conversation list item in the sidebar.
 * Matches: avatar circle + two lines of text (title + preview).
 */
export function ConversationItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/**
 * Skeleton for the full conversation list (multiple items).
 */
export function ConversationListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }, (_, i) => (
        <ConversationItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a single message bubble in the thread view.
 * Alternates alignment to mimic real message layout.
 */
function MessageBubbleSkeleton({ isMe }: { isMe: boolean }) {
  return (
    <div
      className={cn("flex", isMe ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "space-y-1.5 rounded-2xl px-4 py-3",
          isMe ? "max-w-[65%]" : "max-w-[70%]"
        )}
      >
        {!isMe && <Skeleton className="h-3 w-16 mb-1" />}
        <Skeleton className={cn("h-3.5", isMe ? "w-48" : "w-56")} />
        <Skeleton className={cn("h-3.5", isMe ? "w-32" : "w-40")} />
      </div>
    </div>
  );
}

/**
 * Skeleton for a message thread (alternating bubbles with day divider).
 */
export function MessageThreadSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {/* Day divider skeleton */}
      <div className="flex justify-center py-2">
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <MessageBubbleSkeleton key={i} isMe={i % 3 === 0} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a stats card on the dashboard.
 * Matches: title + large number + optional trend indicator.
 */
export function StatsCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/**
 * Skeleton for a grid of stats cards.
 */
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for a search result item.
 */
export function SearchResultSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-16 ml-auto" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-4/5" />
    </div>
  );
}
```

**Why:** Loading skeletons that match the shape of real content prevent layout shift and give users a sense of what's loading. Each downstream project (C1 for conversation list, C2 for messages, G1 for dashboard stats, E4 for search results) needs content-shaped loading indicators.

**Design notes:**
- Skeletons inherit the `animate-pulse` from shadcn's Skeleton primitive
- Message bubbles alternate alignment (every 3rd is "me") to look realistic
- Stats cards match the typical card layout with title/number/trend
- `rounded-2xl` on message skeletons matches iMessage bubble styling

**Verify:** Render `<MessageThreadSkeleton />` — should show alternating pulse bubbles with a centered day divider pill. Render `<StatsGridSkeleton />` — should show a 4-column grid of pulsing cards.

---

### Step 5: Error Boundary Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/shared/error-boundary.tsx`

**Create new file:**

```typescript
"use client";

// ABOUTME: React error boundary with retry — catches render errors in child components.
// ABOUTME: Shows a friendly error message with a retry button to remount the subtree.

import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full min-h-[200px] items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive/70" />
            <h2 className="mt-4 text-lg font-semibold">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.error?.message ||
                "An unexpected error occurred. Please try again."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="mt-4 gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Why:** React error boundaries must be class components (no hook equivalent). This catches rendering errors in any subtree and presents a retry option rather than a white screen. Downstream projects wrap feature sections in `<ErrorBoundary>` for resilience.

**Edge cases:**
- Custom `fallback` prop for cases where the default UI doesn't fit
- Error message displayed if available, otherwise generic fallback text
- Retry resets error state, causing children to remount

**Verify:** Wrap a component that throws during render in `<ErrorBoundary>`. Confirm the error message appears with the retry button. Click retry — confirm the component attempts to render again.

---

### Step 6: Empty State Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/shared/empty-state.tsx`

**Create new file:**

```typescript
// ABOUTME: Reusable empty state pattern — icon, title, description, and optional CTA.
// ABOUTME: Used across all views when no data is available (no conversations, no search results, etc.).

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full items-center justify-center p-8",
        className
      )}
    >
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
          <Icon className="h-7 w-7 text-muted-foreground/70" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {action && (
          <Button asChild variant="outline" size="sm" className="mt-5">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Design notes for warm, personal feel:**
- Icon wrapped in a soft circular background (`rounded-full bg-muted/50`) rather than floating raw — feels more polished and intentional
- Generous spacing (`mt-5`, `leading-relaxed`) gives the empty state breathing room
- `max-w-md` constrains width for comfortable reading
- Optional CTA as an outline button keeps the empty state inviting without being pushy

**Why:** All 8 placeholder pages currently have inline empty state markup. Extracting this into a shared component ensures visual consistency and makes updates propagate everywhere. The `action` prop enables CTA buttons (e.g., "Import your first archive" on the browse page).

**Verify:** Render `<EmptyState icon={MessageSquare} title="No conversations" description="Import your first archive to get started." action={{ label: "Import now", href: "/import" }} />`. Confirm the icon is in a circle, text is centered, and the CTA button links correctly.

---

### Step 7: Page Header Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/shared/page-header.tsx`

**Create new file:**

```typescript
// ABOUTME: Reusable page header with title, optional description, and action slot.
// ABOUTME: Provides consistent typography and spacing at the top of every view.

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode; // Action buttons slot
  className?: string;
}

export function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border px-6 py-5",
        className
      )}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
```

**Why:** Every feature page needs a consistent header area. Without this, each project will set different padding, font sizes, and spacing for their page titles. The `children` slot accommodates action buttons (e.g., "New Chat" on the chat page, filter toggles on calendar).

**Verify:** Render `<PageHeader title="Dashboard" description="Your message archive at a glance" />`. Confirm it shows a bold title with muted description and a bottom border.

---

### Step 8: Update Placeholder Pages to Use Shared Components

Update all 8 placeholder pages to use `EmptyState` and optionally `PageHeader`. Each page is a simple refactor — replace the inline centered div with the shared component.

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/dashboard/page.tsx`

Replace entire content with:
```typescript
// ABOUTME: Dashboard placeholder page — will be built out in G1.
// ABOUTME: Serves as the post-login landing page for authenticated users.

import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function DashboardPage() {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="Dashboard"
      description="Welcome to MessageVault. Your message archive overview will appear here."
      action={{ label: "Import conversations", href: "/import" }}
    />
  );
}
```

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/page.tsx`

```typescript
// ABOUTME: Browse conversations placeholder — will be built in C1.
// ABOUTME: Will redirect to most recent conversation; currently shows empty state.

import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function BrowsePage() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="Browse Conversations"
      description="Select a conversation from the sidebar, or import your first archive to get started."
      action={{ label: "Import conversations", href: "/import" }}
    />
  );
}
```

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/browse/[conversationId]/page.tsx`

Read current content first, then update to use EmptyState pattern. The dynamic route page likely shows a placeholder for a specific conversation — it should keep its structure since C2 will fully replace it.

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/page.tsx`

```typescript
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
```

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/calendar/[dateKey]/page.tsx`

Update similarly with EmptyState.

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/search/page.tsx`

```typescript
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
```

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/page.tsx`

```typescript
// ABOUTME: AI Chat placeholder — will be built in F4.
// ABOUTME: Will provide RAG-powered chat over imported message history.

import { Bot } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function ChatPage() {
  return (
    <EmptyState
      icon={Bot}
      title="AI Chat"
      description="Chat with your message archive using AI. Import conversations to get started."
      action={{ label: "Import conversations", href: "/import" }}
    />
  );
}
```

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/[sessionId]/page.tsx`

Update similarly with EmptyState.

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx`

```typescript
// ABOUTME: Import page placeholder — will be built in B1.
// ABOUTME: Will provide drag-and-drop upload for Apple Messages exports.

import { Upload } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export default function ImportPage() {
  return (
    <EmptyState
      icon={Upload}
      title="Import Conversations"
      description="Drag and drop your Apple Messages export file to get started. Supports .md and .txt files."
    />
  );
}
```

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx`

Read current content first, then update similarly.

**Why:** Using the shared component proves it works in real usage and eliminates duplicated markup. The warm copy style ("Import your first archive to get started") matches the spec's design principle of being "warm and personal."

**Verify:** Navigate to each route in the browser. Confirm all placeholder pages show the icon-in-circle + title + description pattern. Confirm CTA buttons navigate correctly.

---

### Step 9: Create Barrel Export

**File:** `/Users/robert.sawyer/Git/messagevault/components/shared/index.ts`

```typescript
// ABOUTME: Barrel export for shared UI components.
// ABOUTME: Simplifies imports: `import { EmptyState, PageHeader } from "@/components/shared"`.

export { EmptyState } from "./empty-state";
export { ErrorBoundary } from "./error-boundary";
export { MessageTypeIcon } from "./message-type-icon";
export { PageHeader } from "./page-header";
export {
  ConversationItemSkeleton,
  ConversationListSkeleton,
  MessageThreadSkeleton,
  StatsCardSkeleton,
  StatsGridSkeleton,
  SearchResultSkeleton,
} from "./skeletons";
```

**Why:** Barrel export enables clean imports from downstream projects. Single import source for all shared components.

**Verify:** Confirm that `import { EmptyState } from "@/components/shared"` resolves correctly in a page file.

---

## 4. Testing Strategy

### TypeScript Verification
```bash
pnpm build
```
Must pass with zero errors. This validates all imports, type signatures, and JSX return types.

### Visual Verification (Browser)

With the dev server running (`pnpm dev --port 3002` + `pnpm convex dev`):

1. Navigate to each route (`/dashboard`, `/browse`, `/calendar`, `/search`, `/chat`, `/import`, `/settings`)
2. Confirm each shows the EmptyState component with:
   - Icon inside a circular muted background
   - Bold title
   - Muted description text
   - CTA button where specified (dashboard, browse, calendar, chat, import)
3. Confirm CTA buttons navigate to `/import`

### Component Isolation Check

Temporarily render each skeleton and error boundary in a test page to visually confirm:
- `<ConversationListSkeleton />` — 6 pulsing items with circle + two lines
- `<MessageThreadSkeleton />` — centered day pill + alternating message bubbles
- `<StatsGridSkeleton />` — 4-column grid of pulsing cards
- `<ErrorBoundary>` wrapping a component that throws — shows error message + retry button

### Utility Function Spot-Checks

In browser console or a scratch file:
```typescript
import { toDateKey, formatRelativeTimestamp, formatDayHeader, isWithinMinutes } from "@/lib/date-utils";

toDateKey(Date.now()); // "2026-03-21"
formatRelativeTimestamp(Date.now() - 5 * 60 * 1000); // "5m ago"
formatRelativeTimestamp(Date.now() - 25 * 60 * 60 * 1000); // "Yesterday"
formatDayHeader("2023-01-15"); // "Sunday, January 15, 2023"
isWithinMinutes(1000, 120001, 2); // true (within 2 min)
isWithinMinutes(1000, 121000, 2); // false (over 2 min)
```

---

## 5. Validation Checklist

- [ ] `lib/date-utils.ts` exists with all 8 exported functions
- [ ] `lib/participant-colors.ts` exists with `PARTICIPANT_COLORS` (12 colors), `getParticipantColor`, `ME_BUBBLE_COLOR`, `OTHER_BUBBLE_COLOR`
- [ ] `app/globals.css` has 12 `--color-participant-*` CSS custom properties in the `@theme` block
- [ ] `components/shared/message-type-icon.tsx` exists and maps all 5 message types
- [ ] `components/shared/skeletons.tsx` exists with 6 exported skeleton components
- [ ] `components/shared/error-boundary.tsx` exists as a class component with retry
- [ ] `components/shared/empty-state.tsx` exists with icon, title, description, optional action
- [ ] `components/shared/page-header.tsx` exists with title, description, children slot
- [ ] `components/shared/index.ts` barrel export exists
- [ ] All 8 placeholder pages updated to use `EmptyState`
- [ ] `pnpm build` passes with zero TypeScript errors
- [ ] All placeholder pages render correctly in the browser
- [ ] Every new file starts with two `ABOUTME:` comment lines

---

## 6. Potential Issues & Mitigations

| Risk | Detection | Mitigation |
|------|-----------|------------|
| oklch participant colors look bad on screen | Visual check in browser | Adjust lightness/chroma values. Key constraint: must be readable with white text overlay |
| `toDateKey` timezone edge cases | Test near midnight | Uses local time via `new Date()` constructor — matches import pipeline behavior |
| Error boundary doesn't catch async errors | Async errors in useEffect won't be caught | This is expected React behavior — error boundaries only catch render/lifecycle errors. Async error handling is a separate concern per feature |
| Barrel export causes circular dependencies | Build fails or runtime errors | Barrel only re-exports leaf modules — no risk of circularity given the flat structure |
| `"use client"` missing on components using hooks | Build error about server/client boundary | Only `error-boundary.tsx` needs `"use client"` (uses class state). EmptyState, PageHeader, and skeletons are pure render — they work as server components |
| shadcn Skeleton import path | TypeScript error | Verified: `@/components/ui/skeleton` exists and exports `Skeleton` |

---

## 7. Assumptions & Dependencies

### Prerequisites (must be true before execution)
- A1 (project setup) is complete — `pnpm`, Next.js, Tailwind, shadcn/ui all configured (verified)
- A4 (app shell) is complete — layout, sidebar, topbar, placeholder pages exist (verified)
- `components/ui/skeleton.tsx` exists (shadcn primitive) (verified)
- `lucide-react` is installed (in package.json)
- Dev server is NOT running during `pnpm build` verification

### No External Dependencies
- No new npm packages needed
- No Convex backend changes
- No environment variables
- No API keys

### Design Decisions Embedded in This Plan
- **12-color palette** with oklch values optimized for dark mode — if these don't look right visually, the executor should adjust lightness/chroma while keeping hue spacing even
- **EmptyState uses icon-in-circle** pattern rather than raw floating icon — this is a design choice for warmth; the spec says "warm and personal"
- **PageHeader has bottom border** — creates visual separation between header and content area; consistent with the topbar's `border-b` pattern
- **No "illustration placeholder"** mentioned in the plan spec — the icon-in-circle serves this role. A custom SVG illustration is unnecessary for a family app with 2-3 users
