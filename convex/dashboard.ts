// ABOUTME: Dashboard aggregate queries — stats overview, recent messages, and storage stats.
// ABOUTME: Computes totals from conversations and participants tables for the dashboard view.

import { query } from "./_generated/server";
import { getUserId } from "./lib/auth";

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
    const totalConversations = conversations.length;

    let earliestDate: number | null = null;
    let latestDate: number | null = null;
    for (const conv of conversations) {
      if (earliestDate === null || conv.dateRange.start < earliestDate) {
        earliestDate = conv.dateRange.start;
      }
      if (latestDate === null || conv.dateRange.end > latestDate) {
        latestDate = conv.dateRange.end;
      }
    }

    const topParticipants = participants
      .filter((p) => !p.isMe)
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 5)
      .map((p) => ({
        _id: p._id,
        displayName: p.displayName,
        messageCount: p.messageCount,
        avatarColor: p.avatarColor,
      }));

    return {
      totalMessages,
      totalConversations,
      dateRange: earliestDate && latestDate
        ? { start: earliestDate, end: latestDate }
        : null,
      topParticipants,
    };
  },
});

export const recentMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    const recentStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) => q.eq("userId", userId as any))
      .order("desc")
      .take(3);

    if (recentStats.length === 0) return [];

    const allMessages = [];
    for (const stat of recentStats) {
      const dayMessages = await ctx.db
        .query("messages")
        .withIndex("by_userId_dateKey", (q) =>
          q.eq("userId", userId as any).eq("dateKey", stat.dateKey)
        )
        .collect();
      allMessages.push(...dayMessages);
    }

    allMessages.sort((a, b) => b.timestamp - a.timestamp);
    const recent = allMessages.slice(0, 5);

    const convIds = [...new Set(recent.map((m) => m.conversationId))];
    const convMap = new Map<string, string>();
    for (const cid of convIds) {
      const conv = await ctx.db.get(cid);
      if (conv) convMap.set(cid as unknown as string, conv.title);
    }

    return recent.map((m) => ({
      _id: m._id,
      conversationId: m.conversationId,
      conversationTitle: convMap.get(m.conversationId as unknown as string) ?? "Unknown",
      senderName: m.senderName,
      content: m.content,
      timestamp: m.timestamp,
      messageType: m.messageType,
    }));
  },
});

/**
 * Storage usage stats for the data management view.
 */
export const storageStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    const totalMessages = conversations.reduce(
      (sum, c) => sum + c.messageCount,
      0
    );

    const importJobs = await ctx.db
      .query("importJobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();
    const totalEmbeddings = importJobs
      .filter((j) => j.status === "completed")
      .reduce((sum, j) => sum + j.embeddedMessages, 0);

    const dailyStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) => q.eq("userId", userId as any))
      .collect();

    const chatSessions = await ctx.db
      .query("chatSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    return {
      totalMessages,
      totalConversations: conversations.length,
      totalEmbeddings,
      totalDailyStats: dailyStats.length,
      totalChatSessions: chatSessions.length,
    };
  },
});
