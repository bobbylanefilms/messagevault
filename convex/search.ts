// ABOUTME: Search engine — keyword, semantic, and hybrid search with RRF fusion.
// ABOUTME: Single entry point (hybridSearch) delegates to keyword/semantic, merges results, adds context.

import { action, internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { generateQueryEmbedding } from "./lib/embeddings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Internal query: resolve a Clerk subject ID to a Convex userId.
 */
export const resolveUserId = internalQuery({
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
export const getMessagesByIds = internalQuery({
  args: { messageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const messages = await Promise.all(
      args.messageIds.map((id) =>
        ctx.db.get(id as Id<"messages">)
      )
    );
    return messages.filter(Boolean).map((msg) => ({
      _id: msg!._id as string,
      conversationId: msg!.conversationId as string,
      participantId: msg!.participantId as string,
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

// ---------------------------------------------------------------------------
// E2: Semantic Search (internal action — called by hybridSearch)
// ---------------------------------------------------------------------------

/**
 * Semantic search — embed query with Voyage-3-lite, search vector index.
 * Returns semantically similar messages ranked by cosine similarity.
 *
 * Note: This is an action (not a query) because it calls the external Voyage API.
 * Convex vector search only supports equality filters, so participantId and
 * date range are applied as post-filters.
 */
export const semanticSearch = internalAction({
  args: {
    searchQuery: v.string(),
    conversationId: v.optional(v.string()),
    participantId: v.optional(v.string()),
    dateRangeStart: v.optional(v.number()),
    dateRangeEnd: v.optional(v.number()),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const trimmed = args.searchQuery.trim();
    if (!trimmed) return { results: [], totalCount: 0 };

    const maxResults = args.limit ?? 40;

    // Step 1: Embed the query using Voyage-3-lite (asymmetric "query" type)
    const queryEmbedding = await generateQueryEmbedding(trimmed);

    // Step 2: Query vector index
    // Take extra results to account for post-filtering losses
    const vectorLimit = Math.min(256, maxResults * 4);

    // Vector search only supports OR filters, not AND.
    // Filter by userId at index level; conversationId is post-filtered below.
    const vectorResults = await ctx.vectorSearch("messages", "by_embedding", {
      vector: queryEmbedding,
      limit: vectorLimit,
      filter: (q) => q.eq("userId", args.userId as Id<"users">),
    });

    if (vectorResults.length === 0) return { results: [], totalCount: 0 };

    // Step 3: Fetch full message documents for the vector results
    const messageIds = vectorResults.map((r) => r._id as string);
    const messages: Array<Record<string, any>> = await ctx.runQuery(
      internal.search.getMessagesByIds,
      { messageIds }
    );

    // Build a score lookup from vector results
    const scoreMap = new Map<string, number>();
    for (const vr of vectorResults) {
      scoreMap.set(vr._id as string, vr._score);
    }

    // Step 4: Post-filter by conversation, participant, and date range
    const filtered = messages.filter((msg) => {
      if (args.conversationId && msg.conversationId !== args.conversationId) {
        return false;
      }
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
      _id: msg._id as string,
      conversationId: msg.conversationId as string,
      participantId: msg.participantId as string,
      senderName: msg.senderName as string,
      content: msg.content as string,
      timestamp: msg.timestamp as number,
      dateKey: msg.dateKey as string,
      messageType: msg.messageType as string,
      attachmentRef: msg.attachmentRef as string | undefined,
      hasReactions: msg.hasReactions as boolean,
      _score: scoreMap.get(msg._id as string) ?? 0,
    }));

    scored.sort((a, b) => b._score - a._score);

    return {
      results: scored.slice(0, maxResults),
      totalCount,
    };
  },
});

// ---------------------------------------------------------------------------
// E3: Hybrid Search — the public entry point
// ---------------------------------------------------------------------------

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
    entry.result = r;
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

    // Resolve userId for semantic search
    const userId: string | null = await ctx.runQuery(
      internal.search.resolveUserId,
      { clerkId: identity.subject }
    );
    if (!userId) throw new Error("User not found");

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
      keywordResults = kwResponse.results
        .filter((msg) => {
          if (args.dateRangeStart && msg.timestamp < args.dateRangeStart) return false;
          if (args.dateRangeEnd && msg.timestamp > args.dateRangeEnd) return false;
          return true;
        })
        .map((msg) => ({
          ...msg,
          _id: msg._id as string,
          conversationId: msg.conversationId as string,
          participantId: msg.participantId as string,
          _score: 0,
        }));
    }

    if (mode === "semantic" || mode === "hybrid") {
      const semResponse = await ctx.runAction(internal.search.semanticSearch, {
        searchQuery: trimmed,
        conversationId: args.conversationId as string | undefined,
        participantId: args.participantId as string | undefined,
        dateRangeStart: args.dateRangeStart,
        dateRangeEnd: args.dateRangeEnd,
        userId,
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
