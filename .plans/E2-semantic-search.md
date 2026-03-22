# E2 — Semantic Search

### 1. Problem Summary

**What:** Implement semantic search by embedding the user's query with Voyage-3-lite and querying the Convex vector index. Returns the most semantically similar messages, even when exact keywords don't match.

**Why:** Keyword search (E1) finds exact matches, but users often want to find conversations *about* a topic without knowing the exact words used. Semantic search handles queries like "conversations about vacation plans" — finding messages that discuss trips, travel, time off, etc. even without the word "vacation." This is the second of two retrieval signals that E3 merges via RRF.

**Success Criteria:**
- A Convex action embeds the user's query using Voyage-3-lite and queries the vector index
- Results are scoped to the authenticated user (mandatory) and optionally filtered by conversation
- Post-filtering by participant and date range works correctly
- Each result includes the message content, sender name, timestamp, conversation ID, dateKey, and a similarity score
- Returns up to 40 semantically relevant results (configurable)
- Handles missing embeddings gracefully (messages imported before B5 ran)
- Search completes in under 2 seconds

---

### 2. Current State Analysis

**Schema (already in place):**
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — The `messages` table has the vector index:
  ```typescript
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1024,
    filterFields: ["userId", "conversationId"],
  })
  ```
  Note: `filterFields` only includes `userId` and `conversationId`. Participant and date range filtering must be post-filters.

**Existing embedding infrastructure:**
- `/Users/robert.sawyer/Git/messagevault/convex/lib/embeddings.ts` — Already has `generateQueryEmbedding(query)` that uses Voyage-3-lite with `inputType: "query"` (asymmetric search, matching the `inputType: "document"` used for message embeddings). This is the function we'll use.

**Existing files to modify:**
- `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` — Will add the semantic search as a Convex **action** (not query) since it calls the external Voyage API.

**Key constraint — Convex vector search limitations:**
- Vector search only supports **equality** filters, not range filters
- So `userId` and `conversationId` can be filtered at the index level
- `participantId` and date range must be post-filtered in application code
- Vector search returns up to 256 results per call

**Patterns to follow:**
- Actions use `action()` from `convex/_generated/server` and call `ctx.runQuery()` for DB reads
- Auth in actions: `const identity = await ctx.auth.getUserIdentity()` (see `convex/import.ts:33`)
- Actions can call external APIs (Voyage) directly

**Dependencies:**
- `VOYAGE_API_KEY` must be set in Convex environment variables
- Messages must have embeddings populated (B5 completed)

---

### 3. Detailed Step-by-Step Implementation

#### Step 1: Create the semantic search action in a new file

**File:** `/Users/robert.sawyer/Git/messagevault/convex/search.ts` (new file)

**Why a new file?** The semantic search requires a Convex `action` (external API call to Voyage), while `messages.ts` currently only contains `query` functions. Mixing actions and queries in the same file works but keeping search logic separate is cleaner — E3 will also live here.

```typescript
// ABOUTME: Search actions — semantic and hybrid search across the message archive.
// ABOUTME: Uses Voyage AI embeddings for semantic search and Convex vector index for retrieval.

import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateQueryEmbedding } from "./lib/embeddings";

/**
 * Semantic search — embed query with Voyage-3-lite, search vector index.
 * Returns semantically similar messages ranked by cosine similarity.
 *
 * Note: This is an action (not a query) because it calls the external Voyage API.
 * Convex vector search only supports equality filters, so participantId and
 * date range are applied as post-filters.
 */
export const semanticSearch = action({
  args: {
    searchQuery: v.string(),
    conversationId: v.optional(v.id("conversations")),
    participantId: v.optional(v.id("participants")),
    dateRangeStart: v.optional(v.number()),
    dateRangeEnd: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const trimmed = args.searchQuery.trim();
    if (!trimmed) return { results: [], totalCount: 0 };

    const maxResults = args.limit ?? 40;

    // Resolve userId from Clerk identity
    const userId: string | null = await ctx.runQuery(
      internal.search.resolveUserId,
      { clerkId: identity.subject }
    );
    if (!userId) throw new Error("User not found");

    // Step 1: Embed the query using Voyage-3-lite (asymmetric "query" type)
    const queryEmbedding = await generateQueryEmbedding(trimmed);

    // Step 2: Query vector index
    // Take extra results to account for post-filtering losses
    const vectorLimit = Math.min(256, maxResults * 4);

    const vectorResults = await ctx.vectorSearch("messages", "by_embedding", {
      vector: queryEmbedding,
      limit: vectorLimit,
      filter: (q) => {
        let f = q.eq("userId", userId);
        if (args.conversationId) {
          f = q.eq("conversationId", args.conversationId);
        }
        return f;
      },
    });

    if (vectorResults.length === 0) return { results: [], totalCount: 0 };

    // Step 3: Fetch full message documents for the vector results
    const messageIds = vectorResults.map((r) => r._id);
    const messages: Array<Record<string, any>> = await ctx.runQuery(
      internal.search.getMessagesByIds,
      { messageIds }
    );

    // Build a score lookup from vector results
    const scoreMap = new Map<string, number>();
    for (const vr of vectorResults) {
      scoreMap.set(vr._id, vr._score);
    }

    // Step 4: Post-filter by participant and date range
    let filtered = messages.filter((msg) => {
      if (args.participantId && msg.participantId !== args.participantId) {
        return false;
      }
      if (args.dateRangeStart && msg.timestamp < args.dateRangeStart) {
        return false;
      }
      if (args.dateRangeEnd && msg.timestamp > args.dateRangeEnd) {
        return false;
      }
      return true;
    });

    const totalCount = filtered.length;

    // Step 5: Attach scores and sort by similarity (highest first)
    const scored = filtered.map((msg) => ({
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
      _score: scoreMap.get(msg._id) ?? 0,
    }));

    scored.sort((a, b) => b._score - a._score);

    return {
      results: scored.slice(0, maxResults),
      totalCount,
    };
  },
});

/**
 * Internal query: resolve a Clerk subject ID to a Convex userId.
 */
export const resolveUserId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    return user?._id ?? null;
  },
});

/**
 * Internal query: fetch full message documents by their IDs.
 * Used by search actions that get IDs from vector/text search but need full docs.
 */
export const getMessagesByIds = query({
  args: { messageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const messages = await Promise.all(
      args.messageIds.map((id) => ctx.db.get(id as any))
    );
    return messages.filter(Boolean).map((msg) => ({
      _id: msg!._id,
      conversationId: msg!.conversationId,
      participantId: msg!.participantId,
      senderName: msg!.senderName,
      content: msg!.content,
      timestamp: msg!.timestamp,
      dateKey: msg!.dateKey,
      messageType: msg!.messageType,
      attachmentRef: msg!.attachmentRef,
      hasReactions: msg!.hasReactions,
    }));
  },
});
```

**Important notes on the implementation:**

1. **`resolveUserId` and `getMessagesByIds` are marked as internal queries.** They need to be callable from the action via `ctx.runQuery()`. Since actions can't directly access the DB, they delegate to queries. These should actually use `internalQuery` — see the correction in Step 2.

2. **Vector search filter API:** The Convex `vectorSearch` filter callback uses a builder pattern. The filter must return the final condition. When `conversationId` is provided, we add that equality filter.

3. **Over-fetching for post-filters:** We request `maxResults * 4` from the vector index to account for results that get filtered out by participant/date post-filters. Capped at 256 (Convex max).

**Edge cases:**
- Empty query returns immediately without calling Voyage API
- If no messages have embeddings, vector search returns empty — handled gracefully
- Post-filtering may reduce results below `maxResults` — that's expected and `totalCount` reflects the filtered count

#### Step 2: Fix internal query visibility

The `resolveUserId` and `getMessagesByIds` queries should be `internalQuery` so they're not exposed as public API endpoints, but they need to be callable from the action via `ctx.runQuery(internal.search.*)`.

Update the imports at the top of `convex/search.ts`:

```typescript
import { action, internalQuery } from "./_generated/server";
```

And change both helper queries from `query({` to `internalQuery({`:

```typescript
export const resolveUserId = internalQuery({
  // ... same implementation
});

export const getMessagesByIds = internalQuery({
  // ... same implementation
});
```

**Why:** These are implementation details of the search action, not meant to be called directly by clients. Using `internalQuery` keeps the public API clean.

**How to verify:** In the Convex dashboard, only `search:semanticSearch` should appear in the public functions list. `search:resolveUserId` and `search:getMessagesByIds` should appear under internal functions.

#### Step 3: Verify the Voyage API key is set

**Command:** `pnpm convex env get VOYAGE_API_KEY`

If not set, this was configured during B5 (background embedding generation). The key should already be in place if embeddings were generated successfully.

**How to verify:** Run `pnpm convex env list` and confirm `VOYAGE_API_KEY` appears.

---

### 4. Testing Strategy

**Manual testing via Convex Dashboard:**
1. Call `search:semanticSearch` with `{ searchQuery: "vacation" }` — should return messages semantically related to vacations/trips/travel
2. Call with `{ searchQuery: "funny moments" }` — should return humorous messages even without the word "funny"
3. Call with a `conversationId` filter — verify all results belong to that conversation
4. Call with a `participantId` filter — verify all results are from that participant
5. Call with date range filters — verify all results fall within the range
6. Call with empty string — should return empty results without calling Voyage
7. Test with a very specific query matching one known message — verify it appears in top results

**Verify embedding quality:**
- Compare results for a keyword query ("birthday") vs. semantic query ("celebration") — both should surface birthday-related messages, but semantic should also find party/celebration messages that don't mention "birthday"

---

### 5. Validation Checklist

- [ ] `convex/search.ts` file exists with ABOUTME comments
- [ ] `semanticSearch` action exists and is publicly callable
- [ ] `resolveUserId` is an `internalQuery` (not public)
- [ ] `getMessagesByIds` is an `internalQuery` (not public)
- [ ] Auth check present — unauthenticated calls throw
- [ ] Empty query returns immediately without Voyage API call
- [ ] Vector search uses `userId` equality filter (mandatory)
- [ ] Vector search uses `conversationId` equality filter (when provided)
- [ ] Post-filtering by `participantId` works
- [ ] Post-filtering by date range (`dateRangeStart`, `dateRangeEnd`) works
- [ ] Results include `_score` field (similarity score)
- [ ] Results sorted by `_score` descending
- [ ] `totalCount` reflects post-filtered count
- [ ] No TypeScript errors (`pnpm convex dev` runs clean)
- [ ] Voyage API key is set in Convex environment

---

### 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| Voyage API key not set | Action throws "VOYAGE_API_KEY not set" | Run `pnpm convex env set VOYAGE_API_KEY <key>` |
| No embeddings in messages | Vector search returns 0 results for any query | Run an import with B5 embedding generation, or manually trigger `embeddings:startEmbedding` |
| Voyage API rate limits | 429 errors during search | The `generateQueryEmbedding` function makes a single API call per search — rate limits are unlikely for search. If hit, add a simple retry. |
| Post-filtering removes too many results | `totalCount` much lower than expected | Increase the `vectorLimit` multiplier (currently `maxResults * 4`). Could go up to 256. |
| `ctx.vectorSearch` API shape | TypeScript errors on filter callback | Check Convex docs for the exact filter API. The filter uses `q.eq()` pattern. Convex v1.34 supports this. |
| `resolveUserId` query pattern | May feel redundant vs `getUserId` in auth.ts | Actions can't use `getUserId` directly because it requires DB context. The `resolveUserId` internal query is the correct pattern for actions. |

---

### 7. Assumptions & Dependencies

**Must be true before execution:**
- Convex dev environment is running (`pnpm convex dev`)
- `VOYAGE_API_KEY` is set in Convex environment variables
- Messages have been imported and B5 embedding generation has completed (at least some messages have the `embedding` field populated)
- E1 is complete (not strictly required, but the `convex/search.ts` file is shared)

**External services:**
- Voyage AI API — called once per search query to embed the query text. ~50ms latency.

**No new packages needed** — `voyageai` is already installed and `convex/lib/embeddings.ts` already exports `generateQueryEmbedding`.

**Decisions already made:**
- Voyage-3-lite with 1024 dimensions (Decision D7 in the architecture)
- Asymmetric search: documents embedded with `inputType: "document"`, queries with `inputType: "query"`
- Vector index filter fields are `["userId", "conversationId"]` — participant and date are post-filters
