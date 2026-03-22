// ABOUTME: Data management operations — cascading conversation deletion with batched mutations.
// ABOUTME: Uses the action pattern to handle large conversations within Convex time limits.

import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const getConversationForDeletion = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user) throw new Error("User not found");

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== user._id) {
      throw new Error("Conversation not found or access denied");
    }
    return { ...conversation, userId: user._id };
  },
});

export const getMessageIdsForConversation = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
    return messages.map((m) => ({ _id: m._id, participantId: m.participantId }));
  },
});

export const deleteMessageBatch = internalMutation({
  args: { messageIds: v.array(v.id("messages")) },
  handler: async (ctx, args) => {
    for (const id of args.messageIds) {
      await ctx.db.delete(id);
    }
  },
});

export const deleteReactions = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
    for (const r of reactions) {
      await ctx.db.delete(r._id);
    }
  },
});

export const updateDailyStatsForDeletion = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const allStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) => q.eq("userId", args.userId))
      .collect();

    for (const stat of allStats) {
      const convEntry = stat.conversationBreakdown.find(
        (cb) => cb.conversationId === args.conversationId
      );
      if (convEntry) {
        const newTotal = stat.totalMessages - convEntry.count;
        const newConvBreakdown = stat.conversationBreakdown.filter(
          (cb) => cb.conversationId !== args.conversationId
        );
        if (newTotal <= 0) {
          await ctx.db.delete(stat._id);
        } else {
          await ctx.db.patch(stat._id, {
            totalMessages: newTotal,
            conversationBreakdown: newConvBreakdown,
          });
        }
      }
    }
  },
});

export const updateParticipantCountsForDeletion = internalMutation({
  args: {
    messageCounts: v.array(
      v.object({
        participantId: v.id("participants"),
        count: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const { participantId, count } of args.messageCounts) {
      const participant = await ctx.db.get(participantId);
      if (participant) {
        await ctx.db.patch(participantId, {
          messageCount: Math.max(0, participant.messageCount - count),
          conversationCount: Math.max(0, participant.conversationCount - 1),
        });
      }
    }
  },
});

export const deleteConversationRecord = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const importJobs = await ctx.db
      .query("importJobs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const job of importJobs) {
      if (job.conversationId === args.conversationId) {
        await ctx.db.delete(job._id);
      }
    }
    await ctx.db.delete(args.conversationId);
  },
});

export const deleteConversation = action({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args): Promise<{ deletedMessages: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const conversation = await ctx.runQuery(
      internal.dataManagement.getConversationForDeletion,
      { conversationId: args.conversationId, clerkId: identity.subject }
    );

    const messageInfo: Array<{ _id: any; participantId: any }> = await ctx.runQuery(
      internal.dataManagement.getMessageIdsForConversation,
      { conversationId: args.conversationId }
    );

    const participantCountMap = new Map<string, number>();
    for (const msg of messageInfo) {
      const pid = String(msg.participantId);
      const current = participantCountMap.get(pid) ?? 0;
      participantCountMap.set(pid, current + 1);
    }

    await ctx.runMutation(internal.dataManagement.deleteReactions, {
      conversationId: args.conversationId,
    });

    const BATCH_SIZE = 500;
    const messageIds: any[] = messageInfo.map((m: { _id: any }) => m._id);
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);
      await ctx.runMutation(internal.dataManagement.deleteMessageBatch, {
        messageIds: batch,
      });
    }

    await ctx.runMutation(internal.dataManagement.updateDailyStatsForDeletion, {
      userId: conversation.userId,
      conversationId: args.conversationId,
    });

    const messageCounts = Array.from(participantCountMap.entries()).map(
      ([participantId, count]) => ({
        participantId: participantId as any,
        count,
      })
    );
    await ctx.runMutation(
      internal.dataManagement.updateParticipantCountsForDeletion,
      { messageCounts }
    );

    await ctx.runMutation(internal.dataManagement.deleteConversationRecord, {
      conversationId: args.conversationId,
      userId: conversation.userId,
    });

    return { deletedMessages: messageIds.length };
  },
});
