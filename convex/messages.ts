// ABOUTME: Message queries — paginated list by conversation, count, and single fetch.
// ABOUTME: Primary data source for the browse thread view (C2) and future search/calendar views.

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
