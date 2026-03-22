# E1 — Keyword Search

### 1. Problem Summary

**What:** Implement keyword-based full-text search using Convex's built-in search index on `messages.content`. This is the first of three search retrieval methods that will power the hybrid search system.

**Why:** Users need to find specific messages by exact or partial keyword matches across their entire archive. Keyword search is the foundation — fast, precise, and intuitive. It also serves as one of two ranking signals fed into the hybrid RRF merger (E3).

**Success Criteria:**
- A Convex query function accepts a search string and returns matching messages ranked by relevance
- Results are scoped to the authenticated user (mandatory) and optionally filtered by conversation and/or participant
- Each result includes the message content, sender name, timestamp, conversation ID, and dateKey
- Match term highlighting data is returned (the matched terms or enough info for the UI to highlight)
- Result count is returned
- Search query handles special characters gracefully (no crashes on weird input)
- Returns results in under 1 second for typical queries

---

### 2. Current State Analysis

**Schema (already in place):**
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — The `messages` table already has the search index defined:
  ```typescript
  .searchIndex("search_content", {
    searchField: "content",
    filterFields: ["userId", "conversationId", "participantId"],
  })
  ```
  No schema changes needed.

**Existing files to modify:**
- `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` — Currently has `listByConversation`, `countByConversation`, and `listByDateKey`. The keyword search query will be added here.

**Existing patterns to follow:**
- All queries start with `const userId = await getUserId(ctx);` for auth — see `convex/lib/auth.ts`
- Queries use `query()` from `convex/_generated/server` for read-only operations
- Import `v` from `convex/values` for argument validation
- Every file starts with two `ABOUTME:` comment lines

**Dependencies:**
- `convex/lib/auth.ts` — `getUserId()` helper
- Requires imported messages with the `search_content` index populated (this happens automatically when messages are inserted)

**No new packages needed.**

---

### 3. Detailed Step-by-Step Implementation

#### Step 1: Add keyword search query to messages.ts

**File:** `/Users/robert.sawyer/Git/messagevault/convex/messages.ts`

Add the following query after the existing `listByDateKey` query:

```typescript
/**
 * Keyword search across all messages using Convex full-text search.
 * Returns relevance-ranked results filtered by user, with optional
 * conversation and participant filters.
 */
export const keywordSearch = query({
  args: {
    searchQuery: v.string(),
    conversationId: v.optional(v.id("conversations")),
    participantId: v.optional(v.id("participants")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const maxResults = args.limit ?? 50;

    // Sanitize: trim whitespace, bail on empty
    const trimmed = args.searchQuery.trim();
    if (!trimmed) return { results: [], totalCount: 0 };

    // Build the search query with available filters
    let searchBuilder = ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) => {
        let search = q.search("content", trimmed).eq("userId", userId as any);
        if (args.conversationId) {
          search = search.eq("conversationId", args.conversationId);
        }
        if (args.participantId) {
          search = search.eq("participantId", args.participantId);
        }
        return search;
      });

    // Convex search returns results in relevance order.
    // Take more than needed so we can return a total count.
    const allResults = await searchBuilder.take(256);
    const totalCount = allResults.length;

    // Slice to the requested limit
    const results = allResults.slice(0, maxResults).map((msg) => ({
      _id: msg._id,
      conversationId: msg.conversationId,
      participantId: msg.participantId,
      senderName: msg.senderName,
      content: msg.content,
      timestamp: msg.timestamp,
      dateKey: msg.dateKey,
      messageType: msg.messageType,
      attachmentRef: msg.attachmentRef,
      hasReactions: msg.hasReactions,
    }));

    return { results, totalCount };
  },
});
```

**Why:** Convex's `withSearchIndex` performs full-text search with built-in relevance ranking. The `filterFields` on the index allow efficient server-side filtering without post-processing. We take up to 256 results (Convex's practical max for search) to get an accurate total count, then slice for the page.

**Edge cases:**
- Empty or whitespace-only queries return immediately (no API call)
- Special characters in the search string are handled by Convex's search engine — it tokenizes and normalizes. No manual sanitization beyond trim is needed.
- If no results match, returns `{ results: [], totalCount: 0 }`

**How to verify:** After deploying, test in the Convex dashboard's "Functions" tab:
1. Call `messages:keywordSearch` with `{ searchQuery: "hello" }` — should return matching messages
2. Call with `{ searchQuery: "" }` — should return empty results
3. Call with a `conversationId` filter — should only return results from that conversation
4. Call with a nonexistent word — should return empty results

#### Step 2: Update the ABOUTME comments in messages.ts

**File:** `/Users/robert.sawyer/Git/messagevault/convex/messages.ts`

Update the first two lines from:
```typescript
// ABOUTME: Message queries — paginated list by conversation, count, and single fetch.
// ABOUTME: Primary data source for the browse thread view (C2) and future search/calendar views.
```
to:
```typescript
// ABOUTME: Message queries — paginated list, count, date key list, and keyword search.
// ABOUTME: Data source for browse thread view (C2), calendar day view (D3), and search (E1).
```

**Why:** Keep ABOUTME accurate as file scope expands.

---

### 4. Testing Strategy

**Manual testing via Convex Dashboard:**
1. Navigate to the Convex dashboard → Functions → `messages:keywordSearch`
2. Test with a known word from imported messages — verify results contain that word
3. Test with conversation filter — verify all results belong to that conversation
4. Test with participant filter — verify all results are from that participant
5. Test with empty string — verify empty result set
6. Test with a string containing special characters (e.g., `"hello! :)"`) — verify no error
7. Test with a very common word — verify `totalCount` reflects all matches (up to 256)

**Programmatic verification (optional, from a Convex action):**
- Query for a known unique phrase and verify exactly 1 result
- Query with both conversation and participant filters simultaneously
- Verify all returned messages have `userId` matching the authenticated user

---

### 5. Validation Checklist

- [ ] `keywordSearch` query exists in `convex/messages.ts`
- [ ] Query requires authentication (calls `getUserId`)
- [ ] Query accepts `searchQuery`, optional `conversationId`, optional `participantId`, optional `limit`
- [ ] Empty queries return `{ results: [], totalCount: 0 }` without hitting the index
- [ ] Results are scoped to authenticated user
- [ ] `conversationId` filter works correctly
- [ ] `participantId` filter works correctly
- [ ] Results include all required fields: `_id`, `conversationId`, `participantId`, `senderName`, `content`, `timestamp`, `dateKey`, `messageType`
- [ ] `totalCount` reflects actual match count (up to 256)
- [ ] No TypeScript errors (`pnpm convex dev` runs without type errors)
- [ ] ABOUTME comments updated

---

### 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| Convex search index not yet populated | Query returns 0 results for known content | Run an import first; the search index is auto-built on insert |
| Search returns too many results | `totalCount` at 256 cap frequently | This is expected — Convex caps search at 256. UI (E4) will note "256+" |
| Auth type casting | TypeScript errors on `userId as any` | This pattern is used throughout the codebase (`convex/messages.ts:23`, `convex/conversations.ts:19`). It works because Convex IDs are strings internally. |
| Slow search on very large datasets | Response > 1 second | Convex search indexes are optimized. If slow, reduce `take()` limit. Unlikely at this scale (750K messages). |

---

### 7. Assumptions & Dependencies

**Must be true before execution:**
- Convex dev environment is running (`pnpm convex dev`)
- Messages have been imported (the search index is populated on insert)
- `convex/lib/auth.ts` and `getUserId()` are available and working

**No external services needed** — Convex full-text search is built-in, no API keys required.

**No new packages needed.**

**Decisions already made:**
- Uses the existing `search_content` index defined in `convex/schema.ts`
- 256 result cap is a Convex platform limitation, not a design choice
- Result shape returns raw message fields; E3 will add context expansion and E4 will add highlighting
