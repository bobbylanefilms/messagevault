# Handoff Plan: F1 — Chat Session Management

## 1. Problem Summary

Build the AI chat session infrastructure: CRUD operations for chat sessions, the two-panel chat page layout, session-level configuration (model, thinking, scope), and a Zustand store for ephemeral chat UI state.

**Why:** This is the foundation for the entire AI Chat stage (F1-F5). All subsequent chat features (RAG, streaming, UI, sources) depend on session management being in place.

**Success Criteria:**
- User can create a new chat session from the `/chat` page
- Session list shows all sessions sorted by last activity, with title, model badge, and timestamp
- User can switch between sessions (chat history loads from database)
- User can delete sessions with a confirmation dialog
- Model selector (Opus 4.6, Sonnet 4.6, Haiku 4.5) and thinking toggle are configurable per session
- Session scope controls allow restricting to specific conversations/participants/date ranges
- Auto-generated title from first user message content

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — Schema already defines `chatSessions` (lines 130-151) and `chatMessages` (lines 153-169) tables with all needed fields and indexes.
- `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/page.tsx` — Placeholder page showing empty state. Will be completely replaced.
- `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/[sessionId]/page.tsx` — Placeholder session page. Will be completely replaced.
- `/Users/robert.sawyer/Git/messagevault/convex/lib/auth.ts` — `getUserId(ctx)` helper used by all Convex functions.
- `/Users/robert.sawyer/Git/messagevault/lib/stores/use-search-store.ts` — Reference pattern for Zustand stores.
- `/Users/robert.sawyer/Git/messagevault/components/shell/sidebar.tsx` — Contains AI Chat nav item at `/chat`.
- `/Users/robert.sawyer/Git/messagevault/components/shared/empty-state.tsx` — Reusable empty state component.
- `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` — Pattern reference for Convex query/mutation structure.
- `/Users/robert.sawyer/Git/messagevault/convex/participants.ts` — Pattern reference, includes `list` query used for scope controls.

### Existing Patterns

- All Convex functions start with `getUserId(ctx)` for auth
- Zustand stores in `lib/stores/` with `use` prefix naming
- Components organized by feature in `components/` directory
- Every file starts with two `ABOUTME:` comment lines
- Dark theme throughout with sidebar/card/muted color tokens
- shadcn/ui components for all UI elements

### Dependencies

- Requires A4 (app shell) — already complete
- No external API calls needed for this project
- Uses existing `chatSessions` and `chatMessages` schema tables

## 3. Detailed Step-by-Step Implementation

### Step 1: Create Convex Chat Session Backend (`convex/chatSessions.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/chatSessions.ts` (new file)

**Changes:** Create a new Convex module with queries and mutations for chat session CRUD.

```typescript
// ABOUTME: Chat session CRUD — create, list, get, update, and delete AI chat sessions.
// ABOUTME: Each session tracks model preference, thinking toggle, and optional context scope.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * List all chat sessions for the current user, sorted by last activity descending.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const sessions = await ctx.db
      .query("chatSessions")
      .withIndex("by_userId_lastActivity", (q) => q.eq("userId", userId as any))
      .order("desc")
      .collect();
    return sessions;
  },
});

/**
 * Get a single chat session by ID (with auth check).
 */
export const get = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) return null;
    return session;
  },
});

/**
 * Create a new chat session with the user's default preferences.
 */
export const create = mutation({
  args: {
    model: v.optional(v.string()),
    thinkingEnabled: v.optional(v.boolean()),
    contextScope: v.optional(
      v.object({
        conversationIds: v.optional(v.array(v.id("conversations"))),
        participantIds: v.optional(v.array(v.id("participants"))),
        dateRange: v.optional(
          v.object({ start: v.number(), end: v.number() })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Get user preferences for defaults
    const user = await ctx.db.get(userId as any);
    const model = args.model ?? user?.preferences.defaultModel ?? "claude-sonnet-4-6";
    const thinkingEnabled = args.thinkingEnabled ?? user?.preferences.thinkingEnabled ?? true;

    const sessionId = await ctx.db.insert("chatSessions", {
      userId: userId as any,
      model,
      thinkingEnabled,
      messageCount: 0,
      lastActivityAt: Date.now(),
      contextScope: args.contextScope ?? undefined,
    });

    return sessionId;
  },
});

/**
 * Update session settings (model, thinking, title, scope).
 */
export const update = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    thinkingEnabled: v.optional(v.boolean()),
    contextScope: v.optional(
      v.object({
        conversationIds: v.optional(v.array(v.id("conversations"))),
        participantIds: v.optional(v.array(v.id("participants"))),
        dateRange: v.optional(
          v.object({ start: v.number(), end: v.number() })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      throw new Error("Session not found");
    }

    const updates: Record<string, any> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.model !== undefined) updates.model = args.model;
    if (args.thinkingEnabled !== undefined) updates.thinkingEnabled = args.thinkingEnabled;
    if (args.contextScope !== undefined) updates.contextScope = args.contextScope;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.sessionId, updates);
    }
  },
});

/**
 * Delete a chat session and all its messages.
 */
export const remove = mutation({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      throw new Error("Session not found");
    }

    // Delete all chat messages in this session
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete the session
    await ctx.db.delete(args.sessionId);
  },
});
```

**Why:** This is the data layer foundation. All session operations need Convex backend support.

**Edge cases:**
- Deleting a session with many messages — the loop deletion is fine for small chat histories (typically < 100 messages per session).
- `getUserId` throws if not authenticated — this is the desired behavior.

**Verify:** After deploying (`pnpm convex dev`), manually test via the Convex dashboard data browser.

---

### Step 2: Create Convex Chat Messages Backend (`convex/chatMessages.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/chatMessages.ts` (new file)

**Changes:** Create queries for loading chat message history by session.

```typescript
// ABOUTME: Chat message queries — load conversation history for an AI chat session.
// ABOUTME: Messages ordered chronologically, used by F4 chat UI for display.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * List all messages in a chat session, ordered chronologically.
 */
export const listBySession = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Verify session belongs to user
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      return [];
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return messages;
  },
});
```

**Why:** Separate from chatSessions for clean module boundaries. F3 (streaming) will add mutation functions to this file later.

**Verify:** Check that the query returns an empty array for a new session.

---

### Step 3: Create Zustand Chat Store (`lib/stores/use-chat-store.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/lib/stores/use-chat-store.ts` (new file)

**Changes:** Create a Zustand store for ephemeral chat UI state.

```typescript
// ABOUTME: Zustand store for AI chat UI ephemeral state.
// ABOUTME: Tracks active session, input text, streaming status, and scope panel visibility.

import { create } from "zustand";

interface ChatState {
  /** Currently active session ID */
  activeSessionId: string | null;
  /** Chat input text */
  inputText: string;
  /** Whether a response is currently streaming */
  isStreaming: boolean;
  /** Whether the scope/settings panel is open */
  isScopePanelOpen: boolean;
}

interface ChatActions {
  setActiveSessionId: (id: string | null) => void;
  setInputText: (text: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  toggleScopePanel: () => void;
  setScopePanelOpen: (open: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState & ChatActions>((set) => ({
  activeSessionId: null,
  inputText: "",
  isStreaming: false,
  isScopePanelOpen: false,

  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setInputText: (text) => set({ inputText: text }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  toggleScopePanel: () => set((s) => ({ isScopePanelOpen: !s.isScopePanelOpen })),
  setScopePanelOpen: (open) => set({ isScopePanelOpen: open }),
  reset: () =>
    set({
      activeSessionId: null,
      inputText: "",
      isStreaming: false,
      isScopePanelOpen: false,
    }),
}));
```

**Why:** Follows the established Zustand store pattern (see `use-search-store.ts`, `use-browse-store.ts`). Keeps ephemeral UI state separate from Convex persistent state.

**Verify:** Import works without TypeScript errors.

---

### Step 4: Create Chat Session List Component (`components/chat/chat-session-list.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-session-list.tsx` (new file)

**Changes:** Build the session list panel that shows in the left column of the chat layout.

```typescript
// ABOUTME: Chat session list — left panel showing all AI chat sessions sorted by recency.
// ABOUTME: Each item shows title, model badge, timestamp. Supports create, select, delete.
```

**Key implementation details:**

- Use `useQuery(api.chatSessions.list)` to get reactive session list
- Each session item shows:
  - Title (or "New chat" if untitled), truncated with `truncate` class
  - Model badge: small pill showing "Opus" / "Sonnet" / "Haiku" — use `Badge` from shadcn/ui with `variant="outline"` and color-coded:
    - Opus: `text-amber-400 border-amber-400/30`
    - Sonnet: `text-blue-400 border-blue-400/30`
    - Haiku: `text-emerald-400 border-emerald-400/30`
  - Relative timestamp (e.g., "2h ago", "Yesterday") using a simple relative time formatter
- Active session highlighted with `bg-accent` and left border indicator (matching sidebar pattern)
- "New chat" button at top: `<Button variant="outline" size="sm">` with `Plus` icon from lucide-react
- Delete button appears on hover for each session item — use `Trash2` icon, triggers confirmation dialog
- Delete confirmation uses shadcn/ui `Dialog` component
- Click a session item → `router.push(\`/chat/${session._id}\`)` and update Zustand store

**Design specs:**
- Panel width: `w-72` (fixed), with `border-r border-border` separator
- Background: `bg-card` to differentiate from main area
- Scrollable via `ScrollArea` component
- New chat button: full width at top with `mb-3` spacing
- Session items: `px-3 py-2.5 rounded-lg` with `hover:bg-accent/50` transition
- Active item: `bg-accent` with `border-l-2 border-primary`

**Verify:** Component renders without errors, shows empty state when no sessions exist.

---

### Step 5: Create Chat Session Header Component (`components/chat/chat-session-header.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-session-header.tsx` (new file)

**Changes:** Header bar for the active chat pane with model selector, thinking toggle, and scope control.

```typescript
// ABOUTME: Chat session header — model selector, thinking toggle, and scope settings.
// ABOUTME: Sits at top of the active chat pane, updates session settings via mutations.
```

**Key implementation details:**

- Model selector: shadcn/ui `Select` component with three options:
  - `claude-opus-4-6` → "Claude Opus 4.6"
  - `claude-sonnet-4-6` → "Claude Sonnet 4.6"
  - `claude-haiku-4-5` → "Claude Haiku 4.5"
- Thinking toggle: shadcn/ui `Button` (ghost variant) with `Brain` icon from lucide-react, toggles between enabled/disabled with visual indicator (icon color changes from `text-primary` to `text-muted-foreground`)
- Scope settings: `Settings2` icon button → opens a scope panel (see Step 6)
- Changes call `useMutation(api.chatSessions.update)` to persist to database
- Session title displayed at left, editable on click (inline edit with Enter to save)

**Design specs:**
- Height: `h-14` with `border-b border-border`
- Background: `bg-background`
- Layout: `flex items-center justify-between px-4`
- Title on left: `text-sm font-medium truncate`
- Controls on right: `flex items-center gap-2`
- Model selector: compact size, `w-44`

**Verify:** Selecting a different model updates the session in the database (check via Convex dashboard).

---

### Step 6: Create Scope Controls Panel (`components/chat/chat-scope-panel.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-scope-panel.tsx` (new file)

**Changes:** Collapsible settings panel for restricting chat context to specific conversations, participants, or date ranges.

```typescript
// ABOUTME: Chat scope controls — filter AI context to specific conversations, people, or dates.
// ABOUTME: Opens as a collapsible panel below the session header, saves scope to chatSessions.
```

**Key implementation details:**

- Conversation multi-select: Use `useQuery(api.conversations.list)` to get all conversations, render as checkboxes
- Participant multi-select: Use `useQuery(api.participants.list)` to get all participants, render as checkboxes
- Date range: Two date inputs (start/end) — simple HTML date inputs styled with Tailwind (no need for a date picker library since this is a power-user feature)
- "Clear all" button to reset scope to null (search all messages)
- Each change calls `useMutation(api.chatSessions.update)` with the new `contextScope`
- Panel visibility controlled by `isScopePanelOpen` from Zustand chat store

**Design specs:**
- Animated expand/collapse with `transition-all duration-200`
- Background: `bg-muted/30` with `border-b border-border`
- Padding: `p-4`
- Three-column layout on desktop: conversations | participants | date range
- Each column: heading label (`text-xs font-semibold uppercase text-muted-foreground`) + scrollable checklist below
- Max height: `max-h-48 overflow-y-auto` per column
- Active scope items: primary color indicator

**Verify:** Setting a scope saves correctly to the database and displays when the panel is reopened.

---

### Step 7: Update Chat Page (`app/(app)/chat/page.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/page.tsx` (replace contents)

**Changes:** Replace the placeholder with the full two-panel chat layout.

```typescript
// ABOUTME: AI Chat page — two-panel layout with session list and active chat area.
// ABOUTME: Entry point for AI chat feature, handles session creation and routing.

"use client";
```

**Key implementation details:**

- Two-panel layout: session list on left (`w-72`), chat area on right (flex-1)
- When no session is active, show an empty state in the right pane with:
  - Bot icon, "Start a conversation" title
  - "Select a chat from the sidebar or create a new one" description
  - "New chat" button that creates a session and navigates to it
- "New chat" handler: call `create` mutation → navigate to `/chat/${newSessionId}`
- The right pane is just a container — the actual chat content is rendered by the `[sessionId]` route

**Design specs:**
- Full height: `h-full flex`
- Session list panel: `hidden md:flex flex-col` (hidden on mobile, sidebar-like on desktop)
- Right pane: `flex-1 flex flex-col` with the empty state centered

**Verify:** Page loads, shows session list on left and empty state on right.

---

### Step 8: Update Chat Session Page (`app/(app)/chat/[sessionId]/page.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/[sessionId]/page.tsx` (replace contents)

**Changes:** Replace the placeholder with the active chat session view.

```typescript
// ABOUTME: Individual chat session view — header, message area, and input.
// ABOUTME: Container page that composes ChatSessionHeader + message display + input components.

"use client";
```

**Key implementation details:**

- Load session via `useQuery(api.chatSessions.get, { sessionId })`
- If session not found or doesn't belong to user, redirect to `/chat`
- Layout: `flex flex-col h-full`
  - ChatSessionHeader at top
  - ChatScopePanel (collapsible) below header
  - Message area (flex-1, scrollable) — placeholder for now, will be built in F4
  - Input area at bottom — placeholder for now, will be built in F4
- Pass session data to child components
- For F1, the message area shows a simple "Messages will appear here" placeholder
- For F1, the input area shows a disabled text input with "Type a message..." placeholder

**Auto-title generation:**
- When the first user message is sent (this will be wired in F3/F4), generate a title from the first message content:
  - Truncate to first 50 characters
  - Call `update` mutation with the title
  - This logic should be in a helper function that F3/F4 can call

**Design specs:**
- Session header: fixed at top
- Message area: `flex-1 overflow-y-auto` with `px-4 py-6`
- Input placeholder: `border-t border-border p-4` at bottom

**Verify:** Navigate to `/chat/{sessionId}` — see header with model selector, thinking toggle, and scope button. Session list highlights the active session.

---

### Step 9: Wire Up Session Delete Confirmation

**File:** Updates to `/Users/robert.sawyer/Git/messagevault/components/chat/chat-session-list.tsx`

**Changes:** Add a proper delete confirmation dialog using shadcn/ui `Dialog`.

**Key implementation details:**

- Clicking delete icon on a session opens a Dialog with:
  - Title: "Delete chat?"
  - Description: "This will permanently delete this chat session and all its messages."
  - Cancel and Delete buttons
- Delete calls `useMutation(api.chatSessions.remove)`
- After deletion, if the deleted session was active, navigate to `/chat`
- Show a toast/notification on successful deletion (optional — skip if no toast component is installed)

**Verify:** Delete a session, confirm it's removed from the list and database.

## 4. Testing Strategy

### Manual Testing

1. **Create session:** Click "New chat" → verify session appears in list with correct default model and thinking settings
2. **Switch sessions:** Create 2+ sessions → click between them → verify header updates with correct model/thinking state
3. **Model change:** Change model via dropdown → refresh page → verify model persists
4. **Thinking toggle:** Toggle thinking → refresh → verify state persists
5. **Delete session:** Delete a session → confirm dialog → verify removal from list and database
6. **Scope controls:** Open scope panel → select a conversation → verify saved to database → reopen → verify pre-selected
7. **Empty state:** Delete all sessions → verify empty state appears in right pane

### Type Checking

```bash
pnpm build  # Run AFTER stopping dev server
```

### Convex Deployment

```bash
pnpm convex dev  # Verify schema and functions deploy without errors
```

## 5. Validation Checklist

- [ ] `convex/chatSessions.ts` deployed with list, get, create, update, remove functions
- [ ] `convex/chatMessages.ts` deployed with listBySession query
- [ ] `lib/stores/use-chat-store.ts` created with correct state shape
- [ ] Chat page shows two-panel layout (session list + active pane)
- [ ] Sessions can be created, listed, switched, and deleted
- [ ] Model selector works and persists changes
- [ ] Thinking toggle works and persists changes
- [ ] Scope panel opens/closes and saves filter selections
- [ ] Active session is visually highlighted in session list
- [ ] Session titles auto-generate from first message (helper function ready)
- [ ] Delete confirmation dialog works correctly
- [ ] No TypeScript errors (`pnpm build` passes)
- [ ] All files have ABOUTME comments

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| `getUserId` throws in query context for new users | Auth error on first load | The `ensureUser` mutation in layout.tsx runs first, creating the user record |
| Session list flickers on create/delete | Visual glitch during Convex reactivity | Convex reactivity is optimistic — should be smooth. If needed, add optimistic updates |
| Scope panel with many conversations | Slow rendering if 50+ conversations | Add search/filter within the conversation checklist, or limit display to 20 with "show more" |
| Mobile layout — session list hidden | Can't see sessions on small screens | Add a mobile-specific toggle (sheet/drawer) similar to `MobileSidebar` pattern |

## 7. Assumptions & Dependencies

- **chatSessions and chatMessages tables** already exist in `convex/schema.ts` with all needed indexes
- **Clerk auth** is working and `getUserId(ctx)` returns valid user IDs
- **shadcn/ui components** available: Button, Dialog, Select, Badge, ScrollArea, Separator, Tooltip
- **No additional npm packages** needed for F1
- **The session page's message area and input** are placeholders — F4 will replace them with the full chat UI
- **Auto-title generation** is prepared as a helper but won't fire until F3/F4 wires up message sending
