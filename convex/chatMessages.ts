// ABOUTME: Chat message queries — load conversation history for an AI chat session.
// ABOUTME: Messages ordered chronologically, used by F4 chat UI for display.

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * List all messages in a chat session, ordered chronologically.
 */
export const listBySession = query({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Verify session belongs to user
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      return [];
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return messages;
  },
});

/**
 * Save a user message to the chat session.
 */
export const sendUserMessage = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      throw new Error("Session not found");
    }

    const messageId = await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      userId: userId as any,
      role: "user",
      content: args.content,
    });

    await ctx.db.patch(args.sessionId, {
      lastActivityAt: Date.now(),
      messageCount: session.messageCount + 1,
    });

    // Auto-generate title from first user message
    if (!session.title) {
      const title =
        args.content.slice(0, 50) + (args.content.length > 50 ? "..." : "");
      await ctx.db.patch(args.sessionId, { title });
    }

    return messageId;
  },
});

/**
 * Create an assistant message placeholder with a stream ID.
 */
export const createAssistantMessage = internalMutation({
  args: {
    sessionId: v.id("chatSessions"),
    userId: v.string(),
    model: v.string(),
    streamId: v.string(),
    retrievedMessageIds: v.array(v.id("messages")),
    retrievalStrategy: v.string(),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      userId: args.userId as any,
      role: "assistant",
      content: "",
      model: args.model,
      streamId: args.streamId,
      retrievedMessageIds: args.retrievedMessageIds,
      retrievalStrategy: args.retrievalStrategy,
    });

    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        lastActivityAt: Date.now(),
        messageCount: session.messageCount + 1,
      });
    }

    return messageId;
  },
});

/**
 * Update retrieval info on an assistant message after RAG completes.
 */
export const updateRetrievalInfo = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    retrievedMessageIds: v.array(v.id("messages")),
    retrievalStrategy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      retrievedMessageIds: args.retrievedMessageIds,
      retrievalStrategy: args.retrievalStrategy,
    });
  },
});

/**
 * Finalize an assistant message after streaming completes.
 */
export const finalizeAssistantMessage = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    content: v.string(),
    thinkingContent: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {
      content: args.content,
    };
    if (args.thinkingContent) updates.thinkingContent = args.thinkingContent;
    if (args.inputTokens !== undefined) updates.inputTokens = args.inputTokens;
    if (args.outputTokens !== undefined)
      updates.outputTokens = args.outputTokens;

    await ctx.db.patch(args.messageId, updates);
  },
});
