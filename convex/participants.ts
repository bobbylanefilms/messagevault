// ABOUTME: Participant management — search, create, merge, and list operations.
// ABOUTME: Participants are canonical people across all conversations, supporting alias dedup.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    return await ctx.db
      .query("participants")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();
  },
});

export const search = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!args.searchTerm.trim()) return [];
    return await ctx.db
      .query("participants")
      .withSearchIndex("search_name", (q) =>
        q.search("displayName", args.searchTerm).eq("userId", userId as any)
      )
      .take(10);
  },
});

export const findByName = query({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    return await ctx.db
      .query("participants")
      .withIndex("by_userId_displayName", (q) =>
        q.eq("userId", userId as any).eq("displayName", args.displayName)
      )
      .unique();
  },
});

export const resolveForImport = mutation({
  args: {
    resolutions: v.array(
      v.object({
        extractedName: v.string(),
        action: v.union(v.literal("create"), v.literal("link")),
        isMe: v.boolean(),
        existingParticipantId: v.optional(v.id("participants")),
        displayName: v.string(),
        avatarColor: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const participantMap: Record<string, string> = {};

    for (const resolution of args.resolutions) {
      if (resolution.action === "link" && resolution.existingParticipantId) {
        const existing = await ctx.db.get(resolution.existingParticipantId);
        if (existing && existing.userId === (userId as any)) {
          if (
            resolution.extractedName !== existing.displayName &&
            !existing.aliases.includes(resolution.extractedName)
          ) {
            await ctx.db.patch(resolution.existingParticipantId, {
              aliases: [...existing.aliases, resolution.extractedName],
            });
          }
          participantMap[resolution.extractedName] = resolution.existingParticipantId;
        }
      } else {
        const participantId = await ctx.db.insert("participants", {
          userId: userId as any,
          displayName: resolution.displayName,
          aliases:
            resolution.extractedName !== resolution.displayName
              ? [resolution.extractedName]
              : [],
          isMe: resolution.isMe,
          avatarColor: resolution.avatarColor,
          conversationCount: 0,
          messageCount: 0,
        });
        participantMap[resolution.extractedName] = participantId;
      }
    }

    return participantMap;
  },
});
