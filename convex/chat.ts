// ABOUTME: AI chat actions — query classification, RAG retrieval, and response generation.
// ABOUTME: Orchestrates the full chat pipeline: classify → retrieve → format → stream response.

import { query, action, internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  PersistentTextStreaming,
  type StreamId,
} from "@convex-dev/persistent-text-streaming";
import {
  buildClassificationPrompt,
  buildDateExtractionPrompt,
  formatRetrievedContext,
  calculateTokenBudget,
  truncateChatHistory,
  truncateRetrievedMessages,
  SYSTEM_PROMPT,
  type RetrievalStrategy,
  type ModelId,
  type RetrievedMessage,
} from "./lib/rag";
import { generateQueryEmbedding } from "./lib/embeddings";

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

// ---------------------------------------------------------------------------
// Public query: getStreamBody (used by useStream React hook)
// ---------------------------------------------------------------------------

export const getStreamBody = query({
  args: { streamId: v.string() },
  handler: async (ctx, args) => {
    return await streaming.getStreamBody(ctx, args.streamId as StreamId);
  },
});

// ---------------------------------------------------------------------------
// Internal helper queries
// ---------------------------------------------------------------------------

export const getSession = internalQuery({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const getConversation = internalQuery({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get(args.conversationId as Id<"conversations">);
    } catch {
      return null;
    }
  },
});

export const getChatHistory = internalQuery({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const getLatestUserMessage = internalQuery({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(10);
    return messages.find((m) => m.role === "user") ?? null;
  },
});

// ---------------------------------------------------------------------------
// Internal actions: Query classification
// ---------------------------------------------------------------------------

export const classifyQuery = internalAction({
  args: { query: v.string() },
  handler: async (_ctx, args) => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });
    const prompt = buildClassificationPrompt(args.query);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "hybrid";

    if (text === "date_load" || text === "vector" || text === "hybrid") {
      return text as RetrievalStrategy;
    }
    return "hybrid" as RetrievalStrategy;
  },
});

export const extractDates = internalAction({
  args: { query: v.string() },
  handler: async (_ctx, args) => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });
    const currentDate = new Date().toISOString().split("T")[0]!;
    const prompt = buildDateExtractionPrompt(args.query, currentDate);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "{}";

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { dates: [] as string[], range: null };
      return JSON.parse(jsonMatch[0]) as {
        dates: string[];
        range: { start: string; end: string } | null;
      };
    } catch {
      return { dates: [] as string[], range: null };
    }
  },
});

// ---------------------------------------------------------------------------
// Internal queries: Retrieval
// ---------------------------------------------------------------------------

export const retrieveByDate = internalQuery({
  args: {
    userId: v.string(),
    dateKeys: v.array(v.string()),
    conversationIds: v.optional(v.array(v.string())),
    participantIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const allMessages = [];

    for (const dateKey of args.dateKeys) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_userId_dateKey", (q) =>
          q.eq("userId", args.userId as any).eq("dateKey", dateKey)
        )
        .collect();
      allMessages.push(...messages);
    }

    let filtered = allMessages;
    if (args.conversationIds?.length) {
      const convSet = new Set(args.conversationIds);
      filtered = filtered.filter((m) => convSet.has(m.conversationId as string));
    }
    if (args.participantIds?.length) {
      const partSet = new Set(args.participantIds);
      filtered = filtered.filter((m) => partSet.has(m.participantId as string));
    }

    filtered.sort((a, b) => a.timestamp - b.timestamp);

    return filtered.map((m) => ({
      _id: m._id as string,
      senderName: m.senderName,
      content: m.content,
      timestamp: m.timestamp,
      dateKey: m.dateKey,
      conversationId: m.conversationId as string,
    }));
  },
});

// ---------------------------------------------------------------------------
// Internal actions: Vector retrieval
// ---------------------------------------------------------------------------

export const retrieveByVector = internalAction({
  args: {
    query: v.string(),
    userId: v.string(),
    conversationIds: v.optional(v.array(v.string())),
    participantIds: v.optional(v.array(v.string())),
    dateRangeStart: v.optional(v.number()),
    dateRangeEnd: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ?? 40;

    const queryEmbedding = await generateQueryEmbedding(args.query);

    const vectorResults = await ctx.vectorSearch("messages", "by_embedding", {
      vector: queryEmbedding,
      limit: Math.min(256, maxResults * 4),
      filter: (q) => q.eq("userId", args.userId as Id<"users">),
    });

    if (vectorResults.length === 0) return [];

    const messageIds = vectorResults.map((r) => r._id as string);
    const messages: Array<Record<string, any>> = await ctx.runQuery(
      internal.search.getMessagesByIds,
      { messageIds }
    );

    let filtered = messages;
    if (args.conversationIds?.length) {
      const convSet = new Set(args.conversationIds);
      filtered = filtered.filter((m: any) => convSet.has(m.conversationId));
    }
    if (args.participantIds?.length) {
      const partSet = new Set(args.participantIds);
      filtered = filtered.filter((m: any) => partSet.has(m.participantId));
    }
    if (args.dateRangeStart) {
      filtered = filtered.filter(
        (m: any) => m.timestamp >= args.dateRangeStart!
      );
    }
    if (args.dateRangeEnd) {
      filtered = filtered.filter((m: any) => m.timestamp <= args.dateRangeEnd!);
    }

    const topHits = filtered.slice(0, maxResults);
    const expandedMessages = new Map<string, any>();

    for (const hit of topHits) {
      expandedMessages.set(hit._id, hit);

      const context = await ctx.runQuery(
        internal.search.getSurroundingMessages,
        {
          conversationId: hit.conversationId,
          timestamp: hit.timestamp,
          messageId: hit._id,
          beforeCount: 5,
          afterCount: 5,
        }
      );

      for (const ctxMsg of [...context.before, ...context.after]) {
        if (!expandedMessages.has(ctxMsg._id)) {
          expandedMessages.set(ctxMsg._id, {
            _id: ctxMsg._id,
            senderName: ctxMsg.senderName,
            content: ctxMsg.content,
            timestamp: ctxMsg.timestamp,
            conversationId: hit.conversationId,
            dateKey: new Date(ctxMsg.timestamp).toISOString().split("T")[0],
          });
        }
      }
    }

    const result = Array.from(expandedMessages.values());
    result.sort((a: any, b: any) => a.timestamp - b.timestamp);

    return result.map((m: any) => ({
      _id: m._id as string,
      senderName: m.senderName as string,
      content: m.content as string,
      timestamp: m.timestamp as number,
      dateKey: m.dateKey as string,
      conversationId: m.conversationId as string,
    }));
  },
});

// ---------------------------------------------------------------------------
// Internal action: Assemble RAG context
// ---------------------------------------------------------------------------

export const assembleContext = internalAction({
  args: {
    userQuery: v.string(),
    sessionId: v.id("chatSessions"),
    userId: v.string(),
  },
  returns: v.object({
    systemPrompt: v.string(),
    formattedContext: v.string(),
    chatHistory: v.array(v.object({ role: v.string(), content: v.string() })),
    retrievedMessageIds: v.array(v.string()),
    strategy: v.string(),
    model: v.string(),
    thinkingEnabled: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    systemPrompt: string;
    formattedContext: string;
    chatHistory: Array<{ role: string; content: string }>;
    retrievedMessageIds: string[];
    strategy: string;
    model: string;
    thinkingEnabled: boolean;
  }> => {
    const session: any = await ctx.runQuery(internal.chat.getSession, {
      sessionId: args.sessionId,
    });
    if (!session) throw new Error("Session not found");

    const scope = session.contextScope;
    const conversationIds = scope?.conversationIds?.map(String);
    const participantIds = scope?.participantIds?.map(String);
    const dateRange = scope?.dateRange;

    // Classify query
    const strategy: RetrievalStrategy = await ctx.runAction(
      internal.chat.classifyQuery,
      { query: args.userQuery }
    );

    // Retrieve based on strategy
    let retrievedMessages: any[] = [];

    if (strategy === "date_load" || strategy === "hybrid") {
      const dateInfo = await ctx.runAction(internal.chat.extractDates, {
        query: args.userQuery,
      });

      const dateKeys: string[] = [...(dateInfo.dates || [])];
      if (dateInfo.range) {
        const start = new Date(dateInfo.range.start);
        const end = new Date(dateInfo.range.end);
        const current = new Date(start);
        while (current <= end) {
          dateKeys.push(current.toISOString().split("T")[0]!);
          current.setDate(current.getDate() + 1);
        }
      }

      if (dateKeys.length > 0) {
        // Limit to 31 days max
        const limitedKeys = dateKeys.slice(0, 31);
        const dateMessages = await ctx.runQuery(internal.chat.retrieveByDate, {
          userId: args.userId,
          dateKeys: limitedKeys,
          conversationIds,
          participantIds,
        });
        retrievedMessages.push(...dateMessages);
      }
    }

    if (strategy === "vector" || strategy === "hybrid") {
      const vectorMessages = await ctx.runAction(
        internal.chat.retrieveByVector,
        {
          query: args.userQuery,
          userId: args.userId,
          conversationIds,
          participantIds,
          dateRangeStart: dateRange?.start,
          dateRangeEnd: dateRange?.end,
          limit: 40,
        }
      );
      retrievedMessages.push(...vectorMessages);
    }

    // Deduplicate
    const seen = new Set<string>();
    retrievedMessages = retrievedMessages.filter((m) => {
      if (seen.has(m._id)) return false;
      seen.add(m._id);
      return true;
    });

    const retrievedMessageIds: string[] = retrievedMessages.map((m) => m._id);

    // Resolve conversation titles
    const convIds = [
      ...new Set(retrievedMessages.map((m) => m.conversationId)),
    ];
    const convTitles = new Map<string, string>();
    for (const convId of convIds) {
      const conv = await ctx.runQuery(internal.chat.getConversation, {
        conversationId: convId,
      });
      if (conv) convTitles.set(convId, conv.title);
    }

    const messagesWithTitles = retrievedMessages.map((m) => ({
      ...m,
      conversationTitle: convTitles.get(m.conversationId),
    }));

    // Apply token budget
    const budget = calculateTokenBudget(
      session.model as ModelId,
      session.thinkingEnabled
    );

    const truncated = truncateRetrievedMessages(
      messagesWithTitles,
      budget.retrievedContext
    );
    const formattedContext = formatRetrievedContext(truncated);

    // Get chat history
    const chatHistory = await ctx.runQuery(internal.chat.getChatHistory, {
      sessionId: args.sessionId,
    });

    const truncatedHistory = truncateChatHistory(
      chatHistory.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      budget.chatHistory
    );

    return {
      systemPrompt: SYSTEM_PROMPT,
      formattedContext,
      chatHistory: truncatedHistory,
      retrievedMessageIds: truncated.map((m) => m._id),
      strategy,
      model: session.model,
      thinkingEnabled: session.thinkingEnabled,
    };
  },
});

// ---------------------------------------------------------------------------
// Public action: initiateChat (called by client to start a chat response)
// ---------------------------------------------------------------------------

export const initiateChat = action({
  args: {
    sessionId: v.id("chatSessions"),
    userMessage: v.string(),
  },
  returns: v.object({
    streamId: v.string(),
    assistantMessageId: v.string(),
    sessionId: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    streamId: string;
    assistantMessageId: string;
    sessionId: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Resolve userId
    const userId: string | null = await ctx.runQuery(
      internal.search.resolveUserId,
      { clerkId: identity.subject }
    );
    if (!userId) throw new Error("User not found");

    // Save user message
    await ctx.runMutation(api.chatMessages.sendUserMessage, {
      sessionId: args.sessionId,
      content: args.userMessage,
    });

    // Create stream
    const streamId: StreamId = await streaming.createStream(ctx);

    // Get session for model info
    const session: any = await ctx.runQuery(internal.chat.getSession, {
      sessionId: args.sessionId,
    });

    // Create assistant message placeholder
    const assistantMessageId: string = await ctx.runMutation(
      internal.chatMessages.createAssistantMessage,
      {
        sessionId: args.sessionId,
        userId,
        model: session?.model ?? "claude-sonnet-4-6",
        streamId: streamId as string,
        retrievedMessageIds: [],
        retrievalStrategy: "hybrid",
      }
    );

    return {
      streamId: streamId as string,
      assistantMessageId: assistantMessageId as string,
      sessionId: args.sessionId as string,
    };
  },
});
