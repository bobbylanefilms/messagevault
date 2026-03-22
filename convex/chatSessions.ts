// ABOUTME: Chat session CRUD — create, list, get, update, and delete AI chat sessions.
// ABOUTME: Each session tracks model preference, thinking toggle, and optional context scope.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getUserId } from "./lib/auth";

/**
 * List all chat sessions for the current user, sorted by last activity descending.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const sessions = await ctx.db
      .query("chatSessions")
      .withIndex("by_userId_lastActivity", (q) => q.eq("userId", userId as any))
      .order("desc")
      .collect();
    return sessions;
  },
});

/**
 * Get a single chat session by ID (with auth check).
 */
export const get = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) return null;
    return session;
  },
});

/**
 * Create a new chat session with the user's default preferences.
 */
export const create = mutation({
  args: {
    model: v.optional(v.string()),
    thinkingEnabled: v.optional(v.boolean()),
    contextScope: v.optional(
      v.object({
        conversationIds: v.optional(v.array(v.id("conversations"))),
        participantIds: v.optional(v.array(v.id("participants"))),
        dateRange: v.optional(
          v.object({ start: v.number(), end: v.number() })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Get user preferences for defaults
    const user = await ctx.db.get(userId as Id<"users">);
    const model = args.model ?? user?.preferences?.defaultModel ?? "claude-sonnet-4-6";
    const thinkingEnabled = args.thinkingEnabled ?? user?.preferences?.thinkingEnabled ?? true;

    const sessionId = await ctx.db.insert("chatSessions", {
      userId: userId as any,
      model,
      thinkingEnabled,
      messageCount: 0,
      lastActivityAt: Date.now(),
      contextScope: args.contextScope ?? undefined,
    });

    return sessionId;
  },
});

/**
 * Update session settings (model, thinking, title, scope).
 */
export const update = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    thinkingEnabled: v.optional(v.boolean()),
    contextScope: v.optional(
      v.object({
        conversationIds: v.optional(v.array(v.id("conversations"))),
        participantIds: v.optional(v.array(v.id("participants"))),
        dateRange: v.optional(
          v.object({ start: v.number(), end: v.number() })
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      throw new Error("Session not found");
    }

    const updates: Record<string, any> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.model !== undefined) updates.model = args.model;
    if (args.thinkingEnabled !== undefined) updates.thinkingEnabled = args.thinkingEnabled;
    if (args.contextScope !== undefined) updates.contextScope = args.contextScope;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.sessionId, updates);
    }
  },
});

/**
 * Delete a chat session and all its messages.
 */
export const remove = mutation({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      throw new Error("Session not found");
    }

    // Delete all chat messages in this session
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete the session
    await ctx.db.delete(args.sessionId);
  },
});
