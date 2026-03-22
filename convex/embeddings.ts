// ABOUTME: Batched embedding generation with scheduler chaining and rate limit handling.
// ABOUTME: Processes ~100 messages per Voyage API call, writes embeddings back to messages.

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  buildContextualText,
  generateEmbeddings,
  type MessageForEmbedding,
} from "./lib/embeddings";

const EMBED_BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// startEmbedding — entry point scheduled after daily stats aggregation
// ---------------------------------------------------------------------------

export const startEmbedding = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const totalToEmbed: number = await ctx.runQuery(
      internal.embeddings.countUnembeddedMessages,
      { conversationId: args.conversationId }
    );

    if (totalToEmbed === 0) {
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "completed",
        completedAt: Date.now(),
      });
      return;
    }

    await ctx.scheduler.runAfter(0, internal.embeddings.processBatch, {
      jobId: args.jobId,
      conversationId: args.conversationId,
      offset: 0,
      totalToEmbed,
      embeddedSoFar: 0,
      retryCount: 0,
    });
  },
});

// ---------------------------------------------------------------------------
// processBatch — generates embeddings for one batch, chains to next
// ---------------------------------------------------------------------------

export const processBatch = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
    offset: v.number(),
    totalToEmbed: v.number(),
    embeddedSoFar: v.number(),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      const { messages, prevContext, nextContext } = await ctx.runQuery(
        internal.embeddings.getMessageBatch,
        {
          conversationId: args.conversationId,
          offset: args.offset,
          limit: EMBED_BATCH_SIZE,
        }
      );

      if (messages.length === 0) {
        // Nothing left to embed — mark completed
        await ctx.runMutation(internal.importJobs.updateStatus, {
          jobId: args.jobId,
          status: "completed",
          completedAt: Date.now(),
        });
        return;
      }

      // Build contextual texts for each message in the batch
      const texts = messages.map((msg, i) => {
        const prev = i === 0 ? prevContext : messages[i - 1];
        const next = i === messages.length - 1 ? nextContext : messages[i + 1];
        return buildContextualText(msg, prev ?? null, next ?? null);
      });

      const embeddings = await generateEmbeddings(texts);

      const messageIds = messages.map((m) => m.id);
      await ctx.runMutation(internal.embeddings.writeEmbeddings, {
        messageIds,
        embeddings,
      });

      const newEmbeddedSoFar = args.embeddedSoFar + messages.length;

      // Update progress counter
      await ctx.runMutation(internal.importJobs.updateProgress, {
        jobId: args.jobId,
        embeddedMessages: newEmbeddedSoFar,
      });

      const hasMore = newEmbeddedSoFar < args.totalToEmbed;

      if (hasMore) {
        await ctx.scheduler.runAfter(0, internal.embeddings.processBatch, {
          jobId: args.jobId,
          conversationId: args.conversationId,
          offset: args.offset + messages.length,
          totalToEmbed: args.totalToEmbed,
          embeddedSoFar: newEmbeddedSoFar,
          retryCount: 0,
        });
      } else {
        await ctx.runMutation(internal.importJobs.updateStatus, {
          jobId: args.jobId,
          status: "completed",
          completedAt: Date.now(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimit =
        message.includes("429") ||
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("too many requests");

      if (isRateLimit && args.retryCount < 5) {
        const delayMs = Math.pow(2, args.retryCount) * 1000;
        await ctx.scheduler.runAfter(delayMs, internal.embeddings.processBatch, {
          jobId: args.jobId,
          conversationId: args.conversationId,
          offset: args.offset,
          totalToEmbed: args.totalToEmbed,
          embeddedSoFar: args.embeddedSoFar,
          retryCount: args.retryCount + 1,
        });
      } else {
        await ctx.runMutation(internal.importJobs.updateStatus, {
          jobId: args.jobId,
          status: "failed",
          error: `Embedding failed: ${message}`,
        });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// countUnembeddedMessages — returns count of messages lacking an embedding
// ---------------------------------------------------------------------------

export const countUnembeddedMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    return messages.filter((m) => m.embedding === undefined).length;
  },
});

// ---------------------------------------------------------------------------
// getMessageBatch — returns a slice of unembedded messages with context
// ---------------------------------------------------------------------------

export const getMessageBatch = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    offset: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch all messages ordered by timestamp
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    // Separate out which are unembedded (preserving order)
    const unembedded = allMessages.filter((m) => m.embedding === undefined);

    // Slice to the requested batch
    const batchRaw = unembedded.slice(args.offset, args.offset + args.limit);

    // Convert to MessageForEmbedding shape
    const messages: MessageForEmbedding[] = batchRaw.map((m) => ({
      id: m._id,
      senderName: m.senderName,
      content: m.content,
      dateKey: m.dateKey,
    }));

    // Determine surrounding context from the full ordered list
    // We need the message immediately before the first batch message
    // and immediately after the last batch message in the full ordered list.

    let prevContext: MessageForEmbedding | null = null;
    let nextContext: MessageForEmbedding | null = null;

    if (batchRaw.length > 0) {
      const firstBatchId = batchRaw[0]!._id;
      const lastBatchId = batchRaw[batchRaw.length - 1]!._id;

      const firstIdx = allMessages.findIndex((m) => m._id === firstBatchId);
      const lastIdx = allMessages.findIndex((m) => m._id === lastBatchId);

      if (firstIdx > 0) {
        const prev = allMessages[firstIdx - 1]!;
        prevContext = {
          id: prev._id,
          senderName: prev.senderName,
          content: prev.content,
          dateKey: prev.dateKey,
        };
      }

      if (lastIdx < allMessages.length - 1) {
        const next = allMessages[lastIdx + 1]!;
        nextContext = {
          id: next._id,
          senderName: next.senderName,
          content: next.content,
          dateKey: next.dateKey,
        };
      }
    }

    return { messages, prevContext, nextContext };
  },
});

// ---------------------------------------------------------------------------
// writeEmbeddings — patches each message with its embedding vector
// ---------------------------------------------------------------------------

export const writeEmbeddings = internalMutation({
  args: {
    messageIds: v.array(v.string()),
    embeddings: v.any(),
  },
  handler: async (ctx, args) => {
    const embeddingsArray = args.embeddings as number[][];
    for (let i = 0; i < args.messageIds.length; i++) {
      await ctx.db.patch(args.messageIds[i] as any, {
        embedding: embeddingsArray[i],
      });
    }
  },
});
