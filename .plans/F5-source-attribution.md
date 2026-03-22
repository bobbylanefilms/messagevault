# Handoff Plan: F5 — Source Attribution

## 1. Problem Summary

Add source attribution to AI chat responses — an expandable section below each assistant message showing which archived messages informed the response. Sources are rendered as mini message bubbles grouped by conversation and date, with click-through navigation to the browse view.

**Why:** Source attribution is critical for trust and verifiability. Users need to see exactly which messages Claude used as context, and be able to verify claims by jumping to the original conversation. Without it, the AI chat is a black box.

**Success Criteria:**
- Each assistant message has an expandable "Sources" section
- Sources section shows a badge with count (e.g., "12 source messages")
- Expanding reveals mini message bubbles with sender, date, and content preview
- Messages are grouped by conversation and date for readability
- Clicking a source navigates to `/browse/[conversationId]` with the message highlighted and scrolled into view
- Retrieval strategy indicator (vector / date_load / hybrid) shown for transparency
- Collapsed by default to keep the chat clean

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/components/chat/chat-message.tsx` — After F4, renders assistant messages. The sources section will be added as a child component within this.
- `/Users/robert.sawyer/Git/messagevault/convex/chatMessages.ts` — Each `chatMessages` record has `retrievedMessageIds` (array of message IDs) and `retrievalStrategy` (string).
- `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` — Has queries for loading messages. Will need a new query to batch-load messages by ID array.
- `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` — `get` query for resolving conversation titles.
- `/Users/robert.sawyer/Git/messagevault/components/browse/message-bubble.tsx` — Reference for the mini bubble styling (smaller version of this).
- `/Users/robert.sawyer/Git/messagevault/lib/stores/use-browse-store.ts` — `setHighlightedMessageId` for search-to-browse navigation (same pattern for source-to-browse).
- `/Users/robert.sawyer/Git/messagevault/components/search/search-result-card.tsx` — Reference for click-through-to-browse pattern using `setHighlightedMessageId` + `router.push`.

### Existing Click-Through Pattern

From `search-result-card.tsx` (lines 93-98):
```typescript
function handleClick() {
  setHighlightedMessageId(messageId);
  router.push(`/browse/${conversationId}`);
}
```

This exact pattern should be reused for source attribution click-through.

### Dependencies

- **F4 (Chat UI)** — source section is rendered within the `ChatMessage` component
- **C2 (Message Thread View)** — browse view must support highlighted message scrolling (already implemented via `highlightedMessageId` in browse store)

## 3. Detailed Step-by-Step Implementation

### Step 1: Add Batch Message Query (`convex/messages.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` (add function)

**Changes:** Add a query to load multiple messages by their IDs, for resolving source attribution.

```typescript
/**
 * Load messages by an array of IDs. Used for source attribution in AI chat.
 * Returns messages with conversation context for display.
 */
export const getByIds = query({
  args: { messageIds: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const messages = await Promise.all(
      args.messageIds.map(async (id) => {
        const msg = await ctx.db.get(id);
        if (!msg || msg.userId !== (userId as any)) return null;
        return msg;
      })
    );

    return messages.filter(Boolean);
  },
});
```

**Why:** The `retrievedMessageIds` array on `chatMessages` stores IDs of source messages. We need to resolve these to full message documents for display. This is a query (not action) so it benefits from Convex reactivity.

**Edge cases:**
- Some message IDs might no longer exist (if conversations are deleted) — filter out nulls
- Auth check ensures users can only see their own messages

**Verify:** Call the query with known message IDs from the Convex dashboard.

---

### Step 2: Create Source Message Component (`components/chat/source-message.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/source-message.tsx` (new file)

```typescript
// ABOUTME: Mini message bubble for source attribution — compact version of browse message bubble.
// ABOUTME: Shows sender, time, and content preview with click-through to browse view.
```

**Key implementation details:**

- Compact version of the browse `MessageBubble`:
  - Smaller text: `text-[12px]` instead of `text-[14px]`
  - Less padding: `px-2.5 py-1.5` instead of `px-3.5 py-2`
  - Narrower max width: `max-w-full` (takes full width of source section)
  - No border-radius variations (simple `rounded-lg`)

- Layout per source message:
  - Sender name + timestamp on one line: `text-[11px] text-muted-foreground`
  - Content below: `text-[12px] leading-relaxed` with `line-clamp-2` for long messages
  - Subtle left border color matching the sender's avatar color

- Click handler:
  ```typescript
  const router = useRouter();
  const setHighlightedMessageId = useBrowseStore((s) => s.setHighlightedMessageId);

  function handleClick() {
    setHighlightedMessageId(messageId);
    router.push(`/browse/${conversationId}`);
  }
  ```

- **Props:**
  ```typescript
  interface SourceMessageProps {
    messageId: string;
    conversationId: string;
    senderName: string;
    content: string;
    timestamp: number;
    isMe: boolean;
    avatarColor: string;
  }
  ```

**Design specs:**
- Container: `cursor-pointer rounded-lg p-2 transition-colors hover:bg-accent/50`
- Left accent border: `border-l-2` with sender's avatar color
- Sender name: colored with avatar color, `font-medium`
- Timestamp: `text-muted-foreground ml-2`
- Content: `text-foreground/80` with line clamp at 2 lines

**Verify:** Component renders a compact message bubble that's clearly different from chat bubbles.

---

### Step 3: Create Sources Section Component (`components/chat/chat-sources.tsx`)

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-sources.tsx` (new file)

```typescript
// ABOUTME: Expandable source attribution section for AI chat responses.
// ABOUTME: Shows which archived messages were used as context, grouped by conversation and date.
```

**Key implementation details:**

- **Props:**
  ```typescript
  interface ChatSourcesProps {
    retrievedMessageIds: string[];
    retrievalStrategy: string;
  }
  ```

- **Data loading:**
  - Convert string IDs to typed IDs for the query
  - Use `useQuery(api.messages.getByIds, { messageIds })` to load source messages
  - Use `useQuery(api.conversations.list)` to resolve conversation titles (already loaded elsewhere, Convex deduplicates)
  - Also need participant data for isMe and avatarColor — load via `useQuery(api.participants.list)`

- **Collapsed state (default):**
  - Show a clickable bar with:
    - Chevron icon (`ChevronRight` / `ChevronDown`)
    - "Sources" label
    - Badge with count: `{n} messages`
    - Strategy badge: "vector" / "date" / "hybrid" in small muted text
  - Click toggles expanded state

- **Expanded state:**
  - Group messages by conversation, then by date within each conversation
  - Conversation headers: `text-xs font-semibold text-muted-foreground` with conversation title
  - Date subheaders: `text-[10px] text-muted-foreground` with formatted date
  - Source messages rendered as `SourceMessage` components

- **Grouping logic:**
  ```typescript
  // Group by conversationId → dateKey → messages[]
  const grouped = new Map<string, Map<string, SourceMessage[]>>();
  for (const msg of sourceMessages) {
    if (!grouped.has(msg.conversationId)) {
      grouped.set(msg.conversationId, new Map());
    }
    const convGroup = grouped.get(msg.conversationId)!;
    if (!convGroup.has(msg.dateKey)) {
      convGroup.set(msg.dateKey, []);
    }
    convGroup.get(msg.dateKey)!.push(msg);
  }
  ```

**Design specs:**
- Collapsed bar: `flex items-center gap-2 mt-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-muted/30 transition-colors`
- Chevron: `h-3.5 w-3.5 text-muted-foreground transition-transform` (rotates 90° when expanded)
- "Sources" label: `text-[12px] font-medium text-muted-foreground`
- Count badge: `text-[11px] bg-muted rounded-full px-2 py-0.5 text-muted-foreground`
- Strategy badge: `text-[10px] text-muted-foreground/60 ml-auto`
- Expanded area: `mt-2 space-y-3 pl-2 border-l border-border/50`
- Conversation header: `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5`
- Date header: `text-[10px] text-muted-foreground/70 mb-1`
- Max height when expanded: `max-h-80 overflow-y-auto` with smooth scroll
- Animation: `transition-all duration-200` for expand/collapse

**Verify:** Sources section shows correct count, expands to show grouped messages, clicking a source navigates to browse.

---

### Step 4: Integrate Sources into ChatMessage Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/chat/chat-message.tsx` (update from F4)

**Changes:** Add the `ChatSources` component below assistant message content.

```typescript
// In the assistant message section, after the message content and copy button:
{message.role === "assistant" && message.retrievedMessageIds && message.retrievedMessageIds.length > 0 && (
  <ChatSources
    retrievedMessageIds={message.retrievedMessageIds}
    retrievalStrategy={message.retrievalStrategy ?? "hybrid"}
  />
)}
```

**Key details:**
- Only show sources section if `retrievedMessageIds` exists and has items
- Position: below the message bubble, within the same alignment container
- The sources section should be OUTSIDE the bubble (not inside the colored background)

**Verify:** Send a chat message, verify the response shows a sources section with the correct number of source messages.

---

### Step 5: Handle Edge Cases

**File:** Updates to `components/chat/chat-sources.tsx`

**Changes:** Handle edge cases for source attribution.

**Edge cases to handle:**

1. **No sources retrieved:** If `retrievedMessageIds` is empty, don't render the section at all (handled in Step 4 with the conditional)

2. **Sources from deleted conversations:** If a source message's conversation no longer exists:
   - Skip rendering that message's conversation header
   - Show the message without a conversation title

3. **Large number of sources:** If > 20 source messages:
   - Initially show only the first 10
   - "Show {n} more sources" button at the bottom
   - Click reveals all remaining sources

4. **Duplicate conversation resolution:** The `conversations.list` query returns all conversations — build a lookup map once:
   ```typescript
   const convMap = new Map(conversations?.map(c => [c._id, c]) ?? []);
   ```

5. **Participant resolution for isMe/avatarColor:** Build a participant lookup map:
   ```typescript
   const participantMap = new Map(participants?.map(p => [p._id, p]) ?? []);
   ```

**Verify:** All edge cases handled — test with varying numbers of sources, deleted conversations, etc.

## 4. Testing Strategy

### Manual Testing (Browser Verification Required)

1. **Sources appear:** Send a chat message → verify AI response has a "Sources" section with correct count
2. **Expand/collapse:** Click the sources bar → section expands → click again → collapses
3. **Grouping:** Verify sources are grouped by conversation, then by date within conversation
4. **Click-through:** Click a source message → navigates to `/browse/[conversationId]` with the message highlighted
5. **Strategy display:** Verify the retrieval strategy badge shows correct strategy (vector/date_load/hybrid)
6. **Empty sources:** If a response has no retrieved messages, verify the sources section doesn't appear
7. **Many sources:** Send a query that retrieves many messages → verify "Show more" behavior with > 20 sources
8. **Different query types:**
   - Date query: "What did we talk about on December 25?" → sources should show messages from that date
   - Topic query: "Conversations about vacation" → sources should show relevant messages from various dates
   - Hybrid query: "What did Mom say about cooking last year?" → sources from multiple strategies

### Type Checking

```bash
pnpm build  # After stopping dev server
```

## 5. Validation Checklist

- [ ] `messages.getByIds` query added and deployed
- [ ] `SourceMessage` component renders compact message bubbles
- [ ] `ChatSources` component shows expandable sources section
- [ ] Sources are grouped by conversation and date
- [ ] Source count badge shows correct number
- [ ] Retrieval strategy badge shows correct strategy
- [ ] Click-through navigates to browse view with message highlighted
- [ ] Sources section is collapsed by default
- [ ] Expand/collapse animation is smooth
- [ ] Large source sets (> 20) show "Show more" pagination
- [ ] Deleted conversations/messages handled gracefully
- [ ] No sources = no section rendered
- [ ] ChatMessage component correctly integrates sources section
- [ ] No TypeScript errors
- [ ] All files have ABOUTME comments

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| `retrievedMessageIds` stores message IDs but some may be deleted | Null returns from `getByIds` | Filter null results, show count as "X of Y sources available" if some are missing |
| Too many source messages slow down the query | Noticeable delay when expanding sources | Lazy load: only query `getByIds` when the section is expanded (use conditional `useQuery` with `skip`) |
| Conversation title resolution requires extra queries | N+1 query pattern | Use the conversations list query (already loaded by sidebar) — Convex deduplicates identical queries |
| Browse view scroll-to-highlight doesn't work for deep messages | Virtualized list may not have the message rendered | The existing browse view already handles this via `highlightedMessageId` in the browse store — verify it works |
| Participant color resolution for source bubbles | Need avatar colors for the left border | Use the participants list query — same deduplication benefit |
| Source messages from different conversations look confusing | No visual separation | Group by conversation with clear headers, use conversation title as a separator |

## 7. Assumptions & Dependencies

- **F4 complete** — `ChatMessage` component exists and renders assistant messages with markdown
- **F1 complete** — session management working
- **F3 complete** — `retrievedMessageIds` and `retrievalStrategy` are populated on assistant messages
- **C2 complete** — Browse view supports `highlightedMessageId` for scroll-to-message behavior
- **`useBrowseStore`** — `setHighlightedMessageId` action available (already used by search-to-browse)
- **Conversation and participant data** available via existing queries
- **No additional npm packages** needed
- **The `retrievedMessageIds` field** on chatMessages uses `v.optional(v.array(v.id("messages")))` — IDs are typed Convex IDs, not plain strings
