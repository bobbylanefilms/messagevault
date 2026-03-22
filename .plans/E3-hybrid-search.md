# E3 — Hybrid Search and Result Merging

### 1. Problem Summary

**What:** Combine keyword search (E1) and semantic search (E2) results using Reciprocal Rank Fusion (RRF). Add surrounding context messages to each result. Support all three search modes: Keyword only, Semantic only, and Hybrid (default).

**Why:** Neither keyword nor semantic search alone is optimal. Keyword search misses paraphrases and related concepts; semantic search can miss exact phrases and proper nouns. RRF fusion gives the best of both — exact matches rank high from keyword, conceptual matches rank high from semantic, and results appearing in both get a significant boost. Surrounding context (1-2 messages before/after) lets users understand the conversation flow without clicking through.

**Success Criteria:**
- A single Convex action accepts a search query, mode, and filters, then returns merged results
- Hybrid mode runs keyword + semantic in parallel and merges with RRF (k=60)
- Keyword-only mode runs only the keyword search
- Semantic-only mode runs only the semantic search
- Each result includes 1-2 surrounding context messages (before and after)
- Duplicate messages across result sets are merged (not duplicated)
- Results sorted by RRF score (hybrid) or native ranking (single mode)
- Distribution stats returned: total count and per-conversation breakdown

---

### 2. Current State Analysis

**Files created by E1 and E2:**
- `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` — Contains `keywordSearch` query (E1)
- `/Users/robert.sawyer/Git/messagevault/convex/search.ts` — Contains `semanticSearch` action, `resolveUserId`, `getMessagesByIds` (E2)

**Existing indexes for context expansion:**
- `messages.by_conversationId_timestamp` — Perfect for fetching surrounding messages. Given a message's `conversationId` and `timestamp`, we can query messages immediately before and after.

**Key RRF formula:**
```
score(message) = Σ 1 / (k + rank_in_list)
```
Where k=60 and the sum is over each result list the message appears in. A message appearing at rank 1 in both lists gets: `1/(60+1) + 1/(60+1) = 0.0328`. A message at rank 1 in only one list gets: `1/(60+1) = 0.0164`.

**Pattern for parallel execution in Convex actions:**
- Actions can call other actions and queries via `ctx.runAction()` and `ctx.runQuery()`
- Keyword search (E1) is a `query` — called via `ctx.runQuery()`
- Semantic search (E2) is an `action` — called via `ctx.runAction()`
- **Important:** In a Convex action, you cannot `Promise.all` a `runQuery` and `runAction` simultaneously. Instead, run the keyword search query first (fast, ~50ms), then the semantic search action (slower, calls Voyage API). Or restructure so both are actions.

**Decision needed by executor:** The keyword search is currently a `query`. To run both in parallel from the hybrid action, both need to be actions (or the hybrid action calls them sequentially). Sequential is simpler and the keyword search is fast enough (~50ms) that the added latency is negligible. The plan uses sequential execution for simplicity.

---

### 3. Detailed Step-by-Step Implementation

#### Step 1: Add the hybrid search action to search.ts

**File:** `/Users/robert.sawyer/Git/messagevault/convex/search.ts`

Add the following action after the existing `semanticSearch` action:

```typescript
import { api } from "./_generated/api";

type SearchMode = "keyword" | "semantic" | "hybrid";

interface SearchResult {
  _id: string;
  conversationId: string;
  participantId: string;
  senderName: string;
  content: string;
  timestamp: number;
  dateKey: string;
  messageType: string;
  attachmentRef?: string;
  hasReactions: boolean;
  _score: number;
}

interface SearchResultWithContext extends SearchResult {
  contextBefore: Array<{
    _id: string;
    senderName: string;
    content: string;
    timestamp: number;
  }>;
  contextAfter: Array<{
    _id: string;
    senderName: string;
    content: string;
    timestamp: number;
  }>;
}

/**
 * Hybrid search — run keyword and/or semantic search, merge with RRF, add context.
 * This is the main search entry point called by the UI (E4).
 */
export const hybridSearch = action({
  args: {
    searchQuery: v.string(),
    mode: v.union(v.literal("keyword"), v.literal("semantic"), v.literal("hybrid")),
    conversationId: v.optional(v.id("conversations")),
    participantId: v.optional(v.id("participants")),
    dateRangeStart: v.optional(v.number()),
    dateRangeEnd: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const trimmed = args.searchQuery.trim();
    if (!trimmed) return { results: [], totalCount: 0, conversationCounts: {} };

    const maxResults = args.limit ?? 50;
    const mode = args.mode;

    let keywordResults: SearchResult[] = [];
    let semanticResults: SearchResult[] = [];

    // --- Run searches based on mode ---

    if (mode === "keyword" || mode === "hybrid") {
      const kwResponse = await ctx.runQuery(api.messages.keywordSearch, {
        searchQuery: trimmed,
        conversationId: args.conversationId,
        participantId: args.participantId,
        limit: 256,
      });

      // Apply date range post-filter for keyword results
      keywordResults = kwResponse.results.filter((msg) => {
        if (args.dateRangeStart && msg.timestamp < args.dateRangeStart) return false;
        if (args.dateRangeEnd && msg.timestamp > args.dateRangeEnd) return false;
        return true;
      }).map((msg, i) => ({
        ...msg,
        _id: msg._id as string,
        conversationId: msg.conversationId as string,
        participantId: msg.participantId as string,
        _score: 0, // Will be replaced by RRF score
      }));
    }

    if (mode === "semantic" || mode === "hybrid") {
      const semResponse = await ctx.runAction(internal.search.semanticSearch, {
        searchQuery: trimmed,
        conversationId: args.conversationId,
        participantId: args.participantId,
        dateRangeStart: args.dateRangeStart,
        dateRangeEnd: args.dateRangeEnd,
        limit: 256,
      });

      semanticResults = semResponse.results.map((msg) => ({
        ...msg,
        _id: msg._id as string,
        conversationId: msg.conversationId as string,
        participantId: msg.participantId as string,
      }));
    }

    // --- Merge results ---

    let merged: SearchResult[];

    if (mode === "hybrid") {
      merged = rrfMerge(keywordResults, semanticResults, 60);
    } else if (mode === "keyword") {
      // Keyword results are already relevance-ranked by Convex
      merged = keywordResults.map((r, i) => ({ ...r, _score: 1 / (60 + i + 1) }));
    } else {
      // Semantic results are already sorted by similarity
      merged = semanticResults;
    }

    const totalCount = merged.length;

    // Slice to requested limit
    const topResults = merged.slice(0, maxResults);

    // --- Add surrounding context ---

    const resultsWithContext: SearchResultWithContext[] = await Promise.all(
      topResults.map(async (result) => {
        const context = await ctx.runQuery(
          internal.search.getSurroundingMessages,
          {
            conversationId: result.conversationId,
            timestamp: result.timestamp,
            messageId: result._id,
            beforeCount: 1,
            afterCount: 1,
          }
        );
        return {
          ...result,
          contextBefore: context.before,
          contextAfter: context.after,
        };
      })
    );

    // --- Compute conversation distribution ---

    const conversationCounts: Record<string, number> = {};
    for (const r of merged) {
      conversationCounts[r.conversationId] =
        (conversationCounts[r.conversationId] ?? 0) + 1;
    }

    return {
      results: resultsWithContext,
      totalCount,
      conversationCounts,
    };
  },
});

/**
 * Reciprocal Rank Fusion — merge two ranked result lists.
 * score(doc) = sum(1 / (k + rank)) for each list containing the doc.
 */
function rrfMerge(
  listA: SearchResult[],
  listB: SearchResult[],
  k: number
): SearchResult[] {
  const scoreMap = new Map<string, { score: number; result: SearchResult }>();

  for (let i = 0; i < listA.length; i++) {
    const r = listA[i]!;
    const entry = scoreMap.get(r._id) ?? { score: 0, result: r };
    entry.score += 1 / (k + i + 1);
    entry.result = r; // Keep the latest version
    scoreMap.set(r._id, entry);
  }

  for (let i = 0; i < listB.length; i++) {
    const r = listB[i]!;
    const entry = scoreMap.get(r._id) ?? { score: 0, result: r };
    entry.score += 1 / (k + i + 1);
    if (!scoreMap.has(r._id)) entry.result = r;
    scoreMap.set(r._id, entry);
  }

  const merged = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, result }) => ({ ...result, _score: score }));

  return merged;
}
```

**Why RRF with k=60?** It's the standard fusion constant from the original RRF paper. Higher k values reduce the influence of rank position, making results more uniform. 60 is the widely adopted default that balances both signals well.

#### Step 2: Add the surrounding context query

**File:** `/Users/robert.sawyer/Git/messagevault/convex/search.ts`

Add this internal query for fetching context messages around a search result:

```typescript
/**
 * Internal query: get messages immediately before and after a target message.
 * Uses the by_conversationId_timestamp index for efficient range queries.
 */
export const getSurroundingMessages = internalQuery({
  args: {
    conversationId: v.string(),
    timestamp: v.number(),
    messageId: v.string(),
    beforeCount: v.number(),
    afterCount: v.number(),
  },
  handler: async (ctx, args) => {
    // Get messages before (descending from timestamp, excluding the target)
    const beforeMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q
          .eq("conversationId", args.conversationId as any)
          .lt("timestamp", args.timestamp)
      )
      .order("desc")
      .take(args.beforeCount);

    // Get messages after (ascending from timestamp, excluding the target)
    const afterMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q
          .eq("conversationId", args.conversationId as any)
          .gt("timestamp", args.timestamp)
      )
      .order("asc")
      .take(args.afterCount);

    return {
      before: beforeMessages.reverse().map((m) => ({
        _id: m._id as string,
        senderName: m.senderName,
        content: m.content,
        timestamp: m.timestamp,
      })),
      after: afterMessages.map((m) => ({
        _id: m._id as string,
        senderName: m.senderName,
        content: m.content,
        timestamp: m.timestamp,
      })),
    };
  },
});
```

**Why this approach?** The `by_conversationId_timestamp` index allows efficient range queries. We query messages with `timestamp < target` (descending, take N) for "before" context and `timestamp > target` (ascending, take N) for "after" context. This avoids loading all messages in a conversation.

**Edge cases:**
- If the target message is the first in a conversation, `before` will be empty
- If the target message is the last, `after` will be empty
- Messages at the exact same timestamp (rare but possible) are excluded by `lt`/`gt` — this is acceptable since we want *surrounding* messages, not duplicates

#### Step 3: Make semanticSearch callable internally

**File:** `/Users/robert.sawyer/Git/messagevault/convex/search.ts`

The `semanticSearch` action needs to be callable from `hybridSearch` via `ctx.runAction(internal.search.semanticSearch, ...)`. Currently it's defined as a public `action`. For E3, we need it callable both publicly (for semantic-only mode from the client) and internally (from hybridSearch).

**Option A (recommended):** Change `semanticSearch` to `internalAction` and have `hybridSearch` be the only public action. The UI (E4) always calls `hybridSearch` with `mode: "semantic"` for semantic-only searches.

Update the import:
```typescript
import { action, internalAction, internalQuery } from "./_generated/server";
```

Change `semanticSearch` from `action` to `internalAction`:
```typescript
export const semanticSearch = internalAction({
  // ... same args and handler
});
```

**Why:** This simplifies the public API to a single entry point (`hybridSearch`) and keeps `semanticSearch` as an internal implementation detail. The UI always calls `hybridSearch` with the appropriate mode.

#### Step 4: Update ABOUTME comments

**File:** `/Users/robert.sawyer/Git/messagevault/convex/search.ts`

Update the header:
```typescript
// ABOUTME: Search engine — keyword, semantic, and hybrid search with RRF fusion.
// ABOUTME: Single entry point (hybridSearch) delegates to keyword/semantic, merges results, adds context.
```

---

### 4. Testing Strategy

**Manual testing via Convex Dashboard:**

1. **Hybrid mode:** Call `search:hybridSearch` with `{ searchQuery: "birthday", mode: "hybrid" }` — verify results include both exact keyword matches AND semantically related messages (e.g., "party", "celebration")
2. **Keyword-only:** Same query with `mode: "keyword"` — verify only exact keyword matches
3. **Semantic-only:** Same query with `mode: "semantic"` — verify conceptually related messages appear
4. **Context messages:** Inspect result objects — each should have `contextBefore` and `contextAfter` arrays with 0-1 messages each
5. **Deduplication:** A message appearing in both keyword and semantic results should appear only once in hybrid results, with a boosted score
6. **Filters:** Test with `conversationId`, `participantId`, and date range filters — verify filtering works in all three modes
7. **Empty query:** `{ searchQuery: "", mode: "hybrid" }` — should return empty results
8. **Distribution stats:** Verify `conversationCounts` object has correct per-conversation breakdowns

**RRF score verification:**
- Find a message that appears in both keyword and semantic results
- Its `_score` should be approximately `1/(60+rank_kw+1) + 1/(60+rank_sem+1)`
- A message in only one list should have roughly half the score of one in both lists

---

### 5. Validation Checklist

- [ ] `hybridSearch` action exists in `convex/search.ts` and is publicly callable
- [ ] `semanticSearch` is changed to `internalAction`
- [ ] `getSurroundingMessages` internal query exists
- [ ] Hybrid mode runs both keyword and semantic search
- [ ] Keyword-only mode skips semantic search (no Voyage API call)
- [ ] Semantic-only mode skips keyword search
- [ ] RRF merge deduplicates messages correctly
- [ ] RRF scores are computed correctly (k=60)
- [ ] Results sorted by RRF score descending
- [ ] Each result has `contextBefore` and `contextAfter` arrays
- [ ] Context messages are from the same conversation as the result
- [ ] `conversationCounts` distribution stats are correct
- [ ] Date range post-filtering works for keyword results
- [ ] All three modes handle empty queries gracefully
- [ ] Auth check present on `hybridSearch`
- [ ] No TypeScript errors

---

### 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| `ctx.runAction` for semanticSearch fails | Error about action not found | Ensure `semanticSearch` is exported and `internal.search.semanticSearch` resolves correctly after switching to `internalAction` |
| Context query slow for many results | Search takes > 2s | The `getSurroundingMessages` query is called once per result. With 50 results, that's 50 queries. Each is an indexed range query (~5ms). Total ~250ms. If slow, batch into fewer queries. |
| Convex `Promise.all` inside action | Unclear if parallel queries are allowed | Convex actions support `Promise.all` for `runQuery` calls. This is the recommended pattern for batch DB reads. |
| Keyword search missing date range filter | Keyword results include out-of-range dates | The E1 `keywordSearch` query doesn't support date range filtering (Convex search index doesn't support range filters). The hybrid action applies date range as a post-filter on keyword results. |
| RRF produces unexpected rankings | Keyword-only results dominate or vice versa | The k=60 constant is standard. If rankings feel off, the UI (E4) lets users switch to single-mode search. |
| Large result set context expansion | Out of memory or timeout with 256 results | We only expand context for `topResults` (sliced to `maxResults`, default 50), not all 256. |

---

### 7. Assumptions & Dependencies

**Must be true before execution:**
- E1 (keyword search) is implemented — `messages.keywordSearch` query exists
- E2 (semantic search) is implemented — `search.semanticSearch` action exists in `convex/search.ts`
- Convex dev environment is running
- Messages are imported with embeddings

**External services:**
- Voyage AI API — called indirectly through `semanticSearch` (only in semantic/hybrid modes)

**No new packages needed.**

**Architecture decision baked in:**
- `hybridSearch` is the single public API for all search. The UI never calls `keywordSearch` or `semanticSearch` directly.
- RRF with k=60 is the merge strategy. This is a well-tested default.
- Context expansion fetches 1 message before and 1 after. The UI spec says "1-2 messages" — starting with 1 keeps context concise. Can increase to 2 if users want more context.
