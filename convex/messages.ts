// ABOUTME: Message queries — paginated list, count, date key list, and keyword search.
// ABOUTME: Data source for browse thread view (C2), calendar day view (D3), and search (E1).

import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Get paginated messages for a conversation, ordered by timestamp ascending.
 * Uses Convex's built-in pagination for efficient cursor-based loading.
 */
export const listByConversation = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Verify conversation belongs to user
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== (userId as any)) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .paginate(args.paginationOpts);

    return result;
  },
});

/**
 * Get the count of messages in a conversation.
 */
export const countByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== (userId as any)) {
      return 0;
    }
    return conversation.messageCount;
  },
});

/**
 * Get all messages for a specific date across all conversations.
 * Used by the calendar day detail view.
 */
export const listByDateKey = query({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any).eq("dateKey", args.dateKey)
      )
      .collect();

    messages.sort((a, b) => a.timestamp - b.timestamp);

    return messages;
  },
});

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
    const searchBuilder = ctx.db
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
