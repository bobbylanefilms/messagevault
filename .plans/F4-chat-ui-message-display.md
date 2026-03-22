# Handoff Plan: F4 — Chat UI and Message Display

## 1. Problem Summary

Build the complete chat interface: message input with send behavior, message history display with distinct user/assistant styling, markdown rendering in AI responses, extended thinking toggle, copy button, suggestion cards on empty state populated with real data, and auto-scroll behavior.

**Why:** This is the user-facing layer of the AI chat — without it, the backend streaming infrastructure from F1-F3 has no interface. The chat UI is where users actually interact with their message archive through AI.

**Success Criteria:**
- Chat input accepts text and sends on Enter (Shift+Enter for newline)
- User messages appear right-aligned, assistant messages left-aligned with model badge
- AI responses render markdown (bold, italic, lists, code blocks, links) via react-markdown
- Extended thinking is shown in a collapsible section above the response
- Copy button appears on hover over AI responses
- Empty state shows 4 suggestion cards populated with real participant names and years from the user's archive
- Clicking a suggestion card populates the input and sends the message
- Chat auto-scrolls to latest message
- Typing indicator shows while waiting for first token
- Streaming text appears incrementally without layout jumps

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/[sessionId]/page.tsx` — After F1, this is the session container with header + scope panel + placeholder message area + placeholder input. F4 replaces the placeholders.
- `/Users/robert.sawyer/Git/messagevault/convex/chatMessages.ts` — After F1, has `listBySession` query. After F3, has `sendUserMessage` mutation.
- `/Users/robert.sawyer/Git/messagevault/convex/chat.ts` — After F3, has `initiateChat` action and `getStreamBody` query.
- `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` — `list` query for getting conversation data for suggestion cards.
- `/Users/robert.sawyer/Git/messagevault/convex/participants.ts` — `list` query for getting participant data for suggestion cards.
- `/Users/robert.sawyer/Git/messagevault/lib/stores/use-chat-store.ts` — After F1, Zustand store with `inputText`, `isStreaming`, `activeSessionId`.
- `/Users/robert.sawyer/Git/messagevault/lib/convex-url.ts` — After F3, helper to get Convex site URL for streaming.
- `/Users/robert.sawyer/Git/messagevault/components/browse/message-bubble.tsx` — Reference for bubble styling patterns (colors, border-radius, alignment).
- `/Users/robert.sawyer/Git/messagevault/app/globals.css` — Theme tokens: `--color-bubble-me`, `--color-bubble-other`, `--color-primary`, etc.

### Installed Packages

- `react-markdown` v10.1.0 — markdown rendering
- `remark-gfm` v4.0.1 — GitHub Flavored Markdown plugin
- `@convex-dev/persistent-text-streaming` v0.3.0 — `useStream` React hook
- lucide-react — icons

### UI Patterns to Follow

- Dark theme with oklch color tokens
- shadcn/ui components (Button, ScrollArea, Tooltip, Badge)
- Feature-organized components (`components/chat/`)
- `"use client"` directive on all interactive components
- Zustand for ephemeral state, Convex `useQuery`/`useMutation`/`useAction` for persistent state

## 3. Detailed Step-by-Step Implementation

### Step 1: Create Chat Message Component (`components/chat/chat-message.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-message.tsx` (new file)

```typescript
// ABOUTME: Individual chat message — renders user or assistant messages with appropriate styling.
// ABOUTME: Assistant messages include markdown rendering, thinking toggle, copy button, and model badge.
```

**Key implementation details:**

**User messages:**
- Right-aligned with `items-end` flex
- Blue bubble using `var(--color-bubble-me)` with white text
- Max width `max-w-[70%]`
- Rounded corners: `rounded-2xl rounded-br-lg`
- Content rendered as plain text (no markdown)

**Assistant messages:**
- Left-aligned with `items-start` flex
- Dark bubble using `var(--color-card)` with `var(--color-foreground)` text
- Border: `border border-border` for subtle delineation
- Max width `max-w-[80%]`
- Rounded corners: `rounded-2xl rounded-bl-lg`
- Model badge: small pill at top-left showing model name
  - Use same color coding as session list (Opus=amber, Sonnet=blue, Haiku=emerald)
- Content rendered with `react-markdown` + `remark-gfm`
- Copy button: appears on hover at top-right corner, `Copy` icon from lucide-react
  - On click: `navigator.clipboard.writeText(content)` → icon changes to `Check` for 2 seconds

**Markdown rendering config:**
```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    // Style overrides for dark theme
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    code: ({ inline, className, children }) => {
      if (inline) {
        return <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono">{children}</code>;
      }
      return (
        <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3">
          <code className="text-[13px] font-mono">{children}</code>
        </pre>
      );
    },
    a: ({ href, children }) => (
      <a href={href} className="text-primary underline hover:text-primary/80" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
  }}
>
  {content}
</ReactMarkdown>
```

**Extended thinking section:**
- Only shown when `thinkingContent` is present
- Collapsible via a toggle button: `Brain` icon + "Show thinking" / "Hide thinking"
- Collapsed by default
- When expanded, shows thinking text in a muted box:
  - `bg-muted/30 border border-border rounded-lg p-3 mt-2 mb-3`
  - `text-[13px] text-muted-foreground font-mono whitespace-pre-wrap`
  - Max height: `max-h-64 overflow-y-auto`

**Design specs:**
- Message timestamp shown below bubble: `text-[10px] text-muted-foreground mt-0.5`
- Spacing between messages: `mt-4` for different senders, `mt-2` for same sender
- User message has small timestamp on the right, assistant on the left

**Verify:** Component renders both user and assistant messages correctly with proper styling.

---

### Step 2: Create Streaming Message Component (`components/chat/chat-streaming-message.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-streaming-message.tsx` (new file)

```typescript
// ABOUTME: Streaming assistant message — subscribes to persistent-text-stream for real-time display.
// ABOUTME: Shows typing indicator before first token, then renders incrementally.
```

**Key implementation details:**

- Uses `useStream` hook from `@convex-dev/persistent-text-streaming/react`:
  ```typescript
  import { useStream } from "@convex-dev/persistent-text-streaming/react";
  import type { StreamId } from "@convex-dev/persistent-text-streaming/client";

  const { text, status } = useStream(
    api.chat.getStreamBody,
    new URL(`${convexSiteUrl}/chat-stream`),
    driven, // true if this client session initiated the stream
    streamId as StreamId
  );
  ```

- **Typing indicator:** When `status === "pending"` or (`status === "streaming"` and `text === ""`):
  - Show three animated dots: `● ● ●` with staggered opacity animation
  - Use CSS animation: each dot fades in/out with a 0.4s delay between them
  ```css
  @keyframes typing-dot {
    0%, 60%, 100% { opacity: 0.3; }
    30% { opacity: 1; }
  }
  ```

- **Streaming text:** When `status === "streaming"` and text is non-empty:
  - Render the text with markdown (same `ReactMarkdown` config as `chat-message.tsx`)
  - Add a blinking cursor character at the end: `▋` with `animate-pulse`

- **Complete:** When `status === "done"`:
  - Render the final text (switch to regular `ChatMessage` component)

- **Error:** When `status === "error"`:
  - Show error message in a red-tinted bubble: `bg-destructive/10 border border-destructive/30`

- **Props:** `streamId`, `driven` (boolean), `model` (for badge), `convexSiteUrl`

**Design specs:**
- Same left-aligned positioning as assistant messages
- Typing indicator uses the same bubble container
- Smooth transition from streaming to complete (no layout jump)

**Verify:** Stream connects and text appears incrementally. Typing indicator shows before first token.

---

### Step 3: Create Chat Input Component (`components/chat/chat-input.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-input.tsx` (new file)

```typescript
// ABOUTME: Chat input — textarea with send button, Enter to send, Shift+Enter for newline.
// ABOUTME: Integrates with Zustand store for input state and streaming status.
```

**Key implementation details:**

- **Textarea** (not a single-line input) that auto-grows:
  - Min height: 1 row (~40px)
  - Max height: 6 rows (~200px) with `overflow-y-auto` beyond that
  - Auto-resize using `useRef` + adjusting `style.height` on input change
  - Placeholder: "Ask about your messages..."
  - Font: `text-[14px]` matching message bubbles

- **Send behavior:**
  - Enter → send message (if not empty and not streaming)
  - Shift+Enter → insert newline
  - Send button: `SendHorizontal` icon from lucide-react
    - Enabled: `text-primary` with `hover:bg-primary/10`
    - Disabled (empty or streaming): `text-muted-foreground opacity-50`

- **Send flow:**
  1. Get input from Zustand store
  2. Clear input immediately (optimistic)
  3. Set `isStreaming: true` in store
  4. Call `useAction(api.chat.initiateChat)` with sessionId and userMessage
  5. Response returns `{ streamId, assistantMessageId }`
  6. The streaming message component picks up the streamId
  7. When stream completes, set `isStreaming: false`

- **Disabled state:** While streaming, the textarea shows "Waiting for response..." placeholder and is disabled

**Design specs:**
- Container: `border-t border-border bg-background px-4 py-3`
- Inner layout: `flex items-end gap-2`
- Textarea: `flex-1 resize-none bg-transparent border-0 focus:outline-none focus:ring-0`
  - With a subtle inner wrapper: `rounded-xl border border-border bg-muted/20 px-4 py-3`
- Send button: `rounded-full p-2 transition-colors` next to the textarea

**Verify:** Type text, press Enter, message sends. Shift+Enter creates newline. Button disabled while streaming.

---

### Step 4: Create Suggestion Cards Component (`components/chat/chat-suggestions.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-suggestions.tsx` (new file)

```typescript
// ABOUTME: Suggestion cards for empty chat state — dynamically populated with user's data.
// ABOUTME: Shows 4 clickable prompts using real participant names and years from the archive.
```

**Key implementation details:**

- Query real data to populate suggestion templates:
  - `useQuery(api.conversations.list)` → get conversation list
  - `useQuery(api.participants.list)` → get participant list

- Build 4 suggestion cards from templates:
  1. **"Summarize my conversations with [most frequent participant]"**
     - Find the participant with the highest `messageCount` (excluding isMe)
     - Use their `displayName`
  2. **"What were the major events we discussed in [year]?"**
     - Look at conversation date ranges to find the most recent year with data
  3. **"Find conversations about [topic]"**
     - Use a generic topic: "family plans" or "upcoming events"
     - This is the one card that doesn't need dynamic data
  4. **"What's the funniest exchange in my messages?"**
     - Static template, no dynamic data needed

- **Card design:**
  - 2x2 grid layout: `grid grid-cols-1 sm:grid-cols-2 gap-3`
  - Each card: `rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-card/80 cursor-pointer`
  - Icon at top: contextual icon for each suggestion (e.g., `User` for participant, `Calendar` for year, `Search` for topic, `Laugh` for funniest)
  - Suggestion text: `text-sm text-foreground mt-2`
  - Subtitle hint: `text-xs text-muted-foreground mt-1` (e.g., "Explore your most active conversation")

- **Click behavior:** Clicking a card:
  1. Sets the suggestion text as the chat input
  2. Immediately sends it as a message (same flow as pressing Enter)

- **Fallback:** If no conversations/participants exist (no data imported), show generic suggestions without personalized names

**Design specs:**
- Centered in the chat area: `max-w-lg mx-auto`
- Above the cards: Bot icon + "What would you like to know?" heading
  - Icon: `h-12 w-12` in a `bg-primary/10 rounded-full p-3` container
  - Text: `text-lg font-medium mt-4 mb-6`

**Verify:** Cards show with real data from the database. Clicking sends the suggestion as a message.

---

### Step 5: Create Chat Message List Component (`components/chat/chat-message-list.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-message-list.tsx` (new file)

```typescript
// ABOUTME: Chat message list — scrollable container for user/assistant message history.
// ABOUTME: Handles auto-scroll, streaming message display, and empty state with suggestions.
```

**Key implementation details:**

- Load messages via `useQuery(api.chatMessages.listBySession, { sessionId })`
- Render each message as `ChatMessage` component
- For the latest assistant message with a `streamId` where content is empty (still streaming):
  - Render `ChatStreamingMessage` instead of `ChatMessage`
  - Pass `driven={true}` if the current client initiated this stream
  - Track "driven" status: when the user sends a message, mark the resulting streamId as driven in Zustand store

- **Auto-scroll behavior:**
  - Use `useRef` on the scroll container
  - After each new message, scroll to bottom
  - Use `scrollIntoView({ behavior: "smooth" })` on a sentinel div at the bottom
  - Only auto-scroll if user was already at the bottom (within 100px threshold) — don't interrupt manual scrolling

- **Empty state:** When no messages exist for the session:
  - Show `ChatSuggestions` component centered in the area

- **Message grouping:** Add visual spacing between messages:
  - Same role consecutive: `mt-2`
  - Different role: `mt-6`

**Design specs:**
- Container: `flex-1 overflow-y-auto px-4 py-6`
- Max content width: `max-w-3xl mx-auto` to keep messages readable
- Bottom sentinel: invisible div for scroll target

**Verify:** Messages render in order, auto-scroll works, streaming message displays correctly.

---

### Step 6: Update Chat Session Page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/chat/[sessionId]/page.tsx` (update from F1)

**Changes:** Replace the placeholder message area and input with the real components.

```typescript
// ABOUTME: Individual chat session view — header, message list, and input.
// ABOUTME: Composes ChatSessionHeader + ChatMessageList + ChatInput for the full chat experience.
```

**Key implementation details:**

- Layout: `flex flex-col h-full`
  - `ChatSessionHeader` — fixed at top
  - `ChatScopePanel` — collapsible below header (from F1)
  - `ChatMessageList` — flex-1, scrollable
  - `ChatInput` — fixed at bottom

- Pass session data and streaming state to children
- Handle the send flow:
  1. `ChatInput` calls `initiateChat` action
  2. Returns `{ streamId, assistantMessageId }`
  3. Store streamId in Zustand for the streaming message component
  4. `ChatMessageList` renders the streaming message
  5. When stream completes, the message is finalized and renders normally

- Wire up the `driven` state: track which streamIds were initiated by this client session

**Verify:** Full chat flow works: type message → send → see typing indicator → see streaming response → see final message with markdown.

---

### Step 7: Add Typing Indicator CSS Animation

**File:** `/Users/robert.sawyer/Git/messagevault/app/globals.css` (append)

**Changes:** Add the typing dot animation keyframes.

```css
/* Chat typing indicator animation */
@keyframes typing-dot {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}

.typing-dot {
  animation: typing-dot 1.4s infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}
```

**Verify:** Dots animate smoothly with staggered timing.

## 4. Testing Strategy

### Manual Testing (Browser Verification Required)

1. **Empty state:** Navigate to a new chat session → see suggestion cards with real data
2. **Send message:** Type a message, press Enter → message appears right-aligned
3. **Streaming response:** After sending → see typing indicator → see text appearing word-by-word
4. **Markdown rendering:** Ask a question that produces markdown (lists, bold, code) → verify rendering
5. **Extended thinking:** Enable thinking, ask a question → see collapsible thinking section
6. **Copy button:** Hover over AI response → copy button appears → click → content copied
7. **Suggestion cards:** Click a suggestion → message sends automatically
8. **Auto-scroll:** Send multiple messages → verify chat scrolls to latest
9. **Manual scroll:** Scroll up to read history → new message should NOT auto-scroll
10. **Shift+Enter:** Press Shift+Enter → newline in input (not sent)
11. **Disabled during streaming:** While AI is responding → input is disabled

### Type Checking

```bash
pnpm build  # After stopping dev server
```

## 5. Validation Checklist

- [ ] `ChatMessage` component renders user and assistant messages with correct styling
- [ ] `ChatStreamingMessage` subscribes to stream and displays text incrementally
- [ ] `ChatInput` sends on Enter, newline on Shift+Enter, disabled during streaming
- [ ] `ChatSuggestions` shows 4 cards populated with real participant/year data
- [ ] `ChatMessageList` renders history, handles empty state, auto-scrolls
- [ ] Markdown renders correctly (bold, italic, lists, code, links, blockquotes)
- [ ] Extended thinking section is collapsible and styled appropriately
- [ ] Copy button works on AI responses
- [ ] Typing indicator animates before first token
- [ ] Streaming text has blinking cursor
- [ ] Auto-scroll works without interrupting manual scrolling
- [ ] Suggestion card click sends the message
- [ ] Session page composes all components correctly
- [ ] No TypeScript errors
- [ ] All files have ABOUTME comments

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| `useStream` hook requires auth token | Stream returns empty/error | Pass `authToken` from Clerk via `useAuth().getToken()` to `useStream` opts |
| react-markdown SSR issues | Hydration mismatch | Component is `"use client"` only — no SSR concern |
| Auto-scroll conflicts with streaming | Scrolls during streaming but user wants to read | Only auto-scroll when user is at bottom; during streaming, always auto-scroll |
| Textarea auto-resize doesn't work | Input stays single line | Use `scrollHeight` trick: set height to 0, then to scrollHeight, clamped at max |
| Suggestion cards with no data | Crashes if no conversations imported | Fallback to generic suggestions when query returns empty |
| Streaming message layout jump | Text appears and shifts layout | Use `min-h-[40px]` on the streaming bubble to prevent collapse |
| Copy fails in insecure context | `navigator.clipboard` not available | Fallback to `document.execCommand('copy')` or show error toast |

## 7. Assumptions & Dependencies

- **F1 complete** — session list, header, scope panel all working
- **F2 complete** — RAG pipeline assembles context correctly
- **F3 complete** — streaming infrastructure works, `initiateChat` action returns `{ streamId, assistantMessageId }`
- **`react-markdown` v10.1.0** and **`remark-gfm` v4.0.1** installed
- **`useStream`** hook from persistent-text-streaming works with the Convex site URL
- **shadcn/ui components** available: Button, ScrollArea, Badge, Tooltip
- **No additional npm packages** needed
- **The `convexSiteUrl`** can be derived from `NEXT_PUBLIC_CONVEX_URL` by replacing `.cloud` with `.site`
