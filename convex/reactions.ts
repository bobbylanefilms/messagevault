// ABOUTME: Reaction queries — fetch reactions for a batch of message IDs.
// ABOUTME: Designed for efficient batch loading in the virtualized browse thread view.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Fetch all reactions for a set of message IDs.
 * Returns a flat array of reactions — the client groups them by messageId.
 */
export const getByMessageIds = query({
  args: {
    messageIds: v.array(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    if (args.messageIds.length === 0) return [];

    const allReactions = [];
    for (const messageId of args.messageIds) {
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
        .collect();

      // Filter to user's reactions only (data isolation)
      const userReactions = reactions.filter(
        (r) => r.userId === (userId as any)
      );

      // Resolve participant names for each reaction
      for (const reaction of userReactions) {
        const participant = await ctx.db.get(reaction.participantId);
        allReactions.push({
          ...reaction,
          reactorName: participant?.displayName ?? "Unknown",
        });
      }
    }

    return allReactions;
  },
});
