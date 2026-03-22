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

export const update = mutation({
  args: {
    participantId: v.id("participants"),
    displayName: v.optional(v.string()),
    avatarColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const participant = await ctx.db.get(args.participantId);
    if (!participant || participant.userId !== (userId as any)) {
      throw new Error("Participant not found");
    }

    const patch: Record<string, unknown> = {};
    if (args.avatarColor !== undefined) {
      patch.avatarColor = args.avatarColor;
    }
    if (args.displayName !== undefined) {
      const trimmed = args.displayName.trim();
      if (!trimmed) throw new Error("Display name cannot be empty");
      patch.displayName = trimmed;

      // Update senderName on all messages from this participant
      if (trimmed !== participant.displayName) {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_participantId", (q) =>
            q.eq("participantId", args.participantId)
          )
          .collect();
        for (const msg of messages) {
          await ctx.db.patch(msg._id, { senderName: trimmed });
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.participantId, patch);
    }
  },
});

export const merge = mutation({
  args: {
    sourceIds: v.array(v.id("participants")),
    targetId: v.id("participants"),
    newDisplayName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const trimmedName = args.newDisplayName.trim();
    if (!trimmedName) throw new Error("Display name cannot be empty");

    // 1. Validate ownership of all participants
    const target = await ctx.db.get(args.targetId);
    if (!target || target.userId !== (userId as any)) {
      throw new Error("Target participant not found");
    }

    const sources = [];
    for (const sourceId of args.sourceIds) {
      const source = await ctx.db.get(sourceId);
      if (!source || source.userId !== (userId as any)) {
        throw new Error("Source participant not found");
      }
      sources.push(source);
    }

    // 2. Collect all aliases from sources and target
    const allAliases = new Set<string>(target.aliases);
    // Add target's current display name as alias if it differs from new name
    if (target.displayName !== trimmedName) {
      allAliases.add(target.displayName);
    }
    for (const source of sources) {
      allAliases.add(source.displayName);
      for (const alias of source.aliases) {
        allAliases.add(alias);
      }
    }
    // Remove the new canonical name from aliases
    allAliases.delete(trimmedName);

    // 3. Reassign all messages from sources to target
    let totalMessageCount = target.messageCount;
    for (const source of sources) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_participantId", (q) =>
          q.eq("participantId", source._id)
        )
        .collect();
      for (const msg of messages) {
        await ctx.db.patch(msg._id, {
          participantId: args.targetId,
          senderName: trimmedName,
        });
      }
      totalMessageCount += source.messageCount;
    }

    // Also update senderName on existing target messages if name changed
    if (trimmedName !== target.displayName) {
      const targetMessages = await ctx.db
        .query("messages")
        .withIndex("by_participantId", (q) =>
          q.eq("participantId", args.targetId)
        )
        .collect();
      for (const msg of targetMessages) {
        await ctx.db.patch(msg._id, { senderName: trimmedName });
      }
    }

    const sourceIdSet = new Set(args.sourceIds.map((id) => String(id)));

    // 4. Update conversations: replace source IDs with target in participantIds
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    for (const conv of conversations) {
      const hasSource = conv.participantIds.some((pid) =>
        sourceIdSet.has(String(pid))
      );
      if (hasSource) {
        const newIds = Array.from(
          new Set(
            conv.participantIds.map((pid) =>
              sourceIdSet.has(String(pid)) ? args.targetId : pid
            )
          )
        );
        await ctx.db.patch(conv._id, { participantIds: newIds as any });
      }
    }

    // 5. Update dailyStats: merge participantBreakdown entries
    const allStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) => q.eq("userId", userId as any))
      .collect();

    for (const stat of allStats) {
      const hasSourceEntry = stat.participantBreakdown.some((entry) =>
        sourceIdSet.has(String(entry.participantId))
      );
      if (hasSourceEntry) {
        const mergedMap = new Map<string, number>();
        for (const entry of stat.participantBreakdown) {
          const key = sourceIdSet.has(String(entry.participantId))
            ? String(args.targetId)
            : String(entry.participantId);
          mergedMap.set(key, (mergedMap.get(key) ?? 0) + entry.count);
        }
        const newBreakdown = Array.from(mergedMap.entries()).map(
          ([pid, count]) => ({
            participantId: pid as any,
            count,
          })
        );
        await ctx.db.patch(stat._id, { participantBreakdown: newBreakdown });
      }
    }

    // 6. Recalculate conversation count for target
    const conversationCount = conversations.filter((conv) =>
      conv.participantIds.some(
        (pid) =>
          String(pid) === String(args.targetId) || sourceIdSet.has(String(pid))
      )
    ).length;

    // 7. Determine isMe: if any participant (target or sources) isMe, result isMe
    const isMe = target.isMe || sources.some((s) => s.isMe);

    // 8. Update target participant record
    await ctx.db.patch(args.targetId, {
      displayName: trimmedName,
      aliases: Array.from(allAliases),
      messageCount: totalMessageCount,
      conversationCount,
      isMe,
    });

    // 9. Delete source participant records
    for (const source of sources) {
      await ctx.db.delete(source._id);
    }
  },
});

export const remove = mutation({
  args: {
    participantId: v.id("participants"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const participant = await ctx.db.get(args.participantId);
    if (!participant || participant.userId !== (userId as any)) {
      throw new Error("Participant not found");
    }

    if (participant.messageCount > 0) {
      throw new Error(
        "Cannot delete a participant who has messages. Use merge instead."
      );
    }

    // Remove from conversation participantIds arrays
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    for (const conv of conversations) {
      if (conv.participantIds.some((pid) => String(pid) === String(args.participantId))) {
        const newIds = conv.participantIds.filter(
          (pid) => String(pid) !== String(args.participantId)
        );
        await ctx.db.patch(conv._id, { participantIds: newIds });
      }
    }

    // Delete the participant
    await ctx.db.delete(args.participantId);
  },
});
