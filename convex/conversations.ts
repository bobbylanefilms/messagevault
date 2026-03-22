// ABOUTME: Conversation queries — list all for current user, get by ID.
// ABOUTME: Sorted by dateRange.end descending (most recently active first).

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * List all conversations for the current user, sorted by most recent activity.
 * Returns conversations with participant details resolved.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    // Sort by dateRange.end descending (most recent activity first)
    conversations.sort((a, b) => b.dateRange.end - a.dateRange.end);

    // Resolve participant names for display
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const participants = await Promise.all(
          conv.participantIds.map((pid) => ctx.db.get(pid))
        );
        const validParticipants = participants.filter(Boolean);
        const participantNames = validParticipants
          .filter((p) => !p!.isMe)
          .map((p) => p!.displayName);
        const meParticipant = validParticipants.find((p) => p?.isMe);
        // Get first non-me participant's color for avatar display
        const firstOtherParticipant = validParticipants.find((p) => !p?.isMe);
        return {
          ...conv,
          participantNames,
          meParticipantId: meParticipant?._id ?? null,
          firstParticipantColor: firstOtherParticipant?.avatarColor ?? null,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single conversation by ID (with auth check).
 */
export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== (userId as any)) {
      return null;
    }

    // Resolve participants
    const participants = await Promise.all(
      conversation.participantIds.map((pid) => ctx.db.get(pid))
    );

    return {
      ...conversation,
      participants: participants.filter(Boolean),
    };
  },
});
