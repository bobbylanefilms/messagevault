// ABOUTME: Batched import pipeline — parses messages, resolves reactions, aggregates stats.
// ABOUTME: Uses scheduler chaining to process large files within Convex's 10-minute action timeout.

import { action, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { parseAppleMessages, type ParticipantMap } from "./lib/parser";

const BATCH_SIZE = 2000;

// ---------------------------------------------------------------------------
// Client-facing: kick off the full import pipeline
// ---------------------------------------------------------------------------

export const startImport = action({
  args: {
    jobId: v.id("importJobs"),
    fileContent: v.string(),
    participantMap: v.any(),
    conversationTitle: v.string(),
    sourceFilename: v.string(),
    isGroupChat: v.boolean(),
    participantIds: v.array(v.string()),
    metadata: v.optional(
      v.object({
        contactInfo: v.optional(v.string()),
        exportedAt: v.optional(v.string()),
        totalMessagesReported: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Auth check — actions have ctx.auth but no direct DB access
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Update job status to "parsing"
    await ctx.runMutation(internal.importJobs.updateStatus, {
      jobId: args.jobId,
      status: "parsing",
    });

    // Parse the entire file
    const participantMap = args.participantMap as ParticipantMap;
    const result = parseAppleMessages(args.fileContent, participantMap);

    const totalMessages = result.messages.length;

    // Create the conversation record
    const conversationId = await ctx.runMutation(internal.import.createConversation, {
      jobId: args.jobId,
      title: args.conversationTitle,
      isGroupChat: args.isGroupChat,
      participantIds: args.participantIds,
      sourceFilename: args.sourceFilename,
      metadata: args.metadata,
      totalMessages,
    });

    // Update job with totals and conversationId
    await ctx.runMutation(internal.importJobs.updateProgress, {
      jobId: args.jobId,
      totalMessages,
      conversationId,
    });

    // Schedule the first batch of message insertions
    if (totalMessages > 0) {
      const firstBatch = result.messages.slice(0, BATCH_SIZE);
      const remaining = result.messages.slice(BATCH_SIZE);

      await ctx.scheduler.runAfter(0, internal.import.insertMessageBatch, {
        jobId: args.jobId,
        conversationId,
        participantMap: args.participantMap,
        batch: firstBatch,
        remainingMessages: remaining,
        reactions: result.reactions,
        insertedSoFar: 0,
        skippedSoFar: 0,
      });
    } else {
      // No messages — skip straight to completion
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "completed",
        completedAt: Date.now(),
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Batched message insertion — chains via scheduler for large files
// ---------------------------------------------------------------------------

export const insertMessageBatch = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
    participantMap: v.any(),
    batch: v.any(),
    remainingMessages: v.any(),
    reactions: v.any(),
    insertedSoFar: v.number(),
    skippedSoFar: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      // Insert this batch
      const { inserted, skipped } = await ctx.runMutation(internal.import.insertMessages, {
        conversationId: args.conversationId,
        batch: args.batch,
      });

      const totalInserted = args.insertedSoFar + inserted;
      const totalSkipped = args.skippedSoFar + skipped;

      // Update progress
      await ctx.runMutation(internal.importJobs.updateProgress, {
        jobId: args.jobId,
        parsedMessages: totalInserted,
        skippedDuplicates: totalSkipped,
      });

      const remaining = args.remainingMessages as unknown[];
      if (remaining.length > 0) {
        // Schedule the next batch
        const nextBatch = remaining.slice(0, BATCH_SIZE);
        const nextRemaining = remaining.slice(BATCH_SIZE);

        await ctx.scheduler.runAfter(0, internal.import.insertMessageBatch, {
          jobId: args.jobId,
          conversationId: args.conversationId,
          participantMap: args.participantMap,
          batch: nextBatch,
          remainingMessages: nextRemaining,
          reactions: args.reactions,
          insertedSoFar: totalInserted,
          skippedSoFar: totalSkipped,
        });
      } else {
        // All messages inserted — schedule reaction resolution
        await ctx.scheduler.runAfter(0, internal.import.resolveReactions, {
          jobId: args.jobId,
          conversationId: args.conversationId,
          reactions: args.reactions,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: `Message insertion failed: ${message}`,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Insert a batch of messages (mutation — has DB access)
// ---------------------------------------------------------------------------

export const insertMessages = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    batch: v.any(),
  },
  handler: async (ctx, args) => {
    // Look up userId from the conversation record
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const userId = conversation.userId;

    let inserted = 0;
    let skipped = 0;

    interface BatchMessage {
      senderName: string;
      participantId: string;
      timestamp: number;
      dateKey: string;
      content: string;
      rawContent?: string;
      messageType: "text" | "image" | "video" | "link" | "attachment_missing";
      attachmentRef?: string;
    }

    for (const msg of args.batch as BatchMessage[]) {
      // Duplicate check: same conversation + timestamp + participantId + content
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_timestamp", (q) =>
          q.eq("conversationId", args.conversationId).eq("timestamp", msg.timestamp)
        )
        .collect();

      const isDuplicate = existing.some(
        (e) => e.participantId === (msg.participantId as any) && e.content === msg.content
      );

      if (isDuplicate) {
        skipped++;
        continue;
      }

      await ctx.db.insert("messages", {
        userId: userId as any,
        conversationId: args.conversationId,
        participantId: msg.participantId as any,
        senderName: msg.senderName,
        timestamp: msg.timestamp,
        dateKey: msg.dateKey,
        content: msg.content,
        rawContent: msg.rawContent,
        messageType: msg.messageType,
        attachmentRef: msg.attachmentRef,
        hasReactions: false,
      });

      inserted++;
    }

    return { inserted, skipped };
  },
});

// ---------------------------------------------------------------------------
// Reaction resolution — match reactions to messages by quoted text
// ---------------------------------------------------------------------------

export const resolveReactions = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
    reactions: v.any(),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.import.insertReactions, {
        conversationId: args.conversationId,
        reactions: args.reactions,
      });

      // Schedule daily stats aggregation
      await ctx.scheduler.runAfter(0, internal.import.aggregateDailyStats, {
        jobId: args.jobId,
        conversationId: args.conversationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: `Reaction resolution failed: ${message}`,
      });
    }
  },
});

export const insertReactions = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    reactions: v.any(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const userId = conversation.userId;

    interface ReactionInput {
      participantId: string;
      senderName: string;
      reactionType: "liked" | "loved" | "laughed" | "disliked" | "emphasized" | "questioned";
      quotedText: string;
      timestamp: number;
    }

    for (const reaction of args.reactions as ReactionInput[]) {
      // Search for the message this reaction refers to by looking at messages
      // near the reaction's timestamp (within 24 hours before) that contain
      // the quoted text.
      const windowStart = reaction.timestamp - 24 * 60 * 60 * 1000;
      const nearbyMessages = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_timestamp", (q) =>
          q
            .eq("conversationId", args.conversationId)
            .gte("timestamp", windowStart)
            .lte("timestamp", reaction.timestamp)
        )
        .collect();

      // Find the best match: prefer exact content match, then prefix match
      let matchedMessageId: string | undefined;

      // First pass: exact match (content === quotedText)
      for (const msg of nearbyMessages) {
        if (msg.content === reaction.quotedText) {
          matchedMessageId = msg._id;
          break;
        }
      }

      // Second pass: content starts with or contains the quoted text
      if (!matchedMessageId) {
        for (const msg of nearbyMessages) {
          if (
            msg.content.startsWith(reaction.quotedText) ||
            msg.content.includes(reaction.quotedText)
          ) {
            matchedMessageId = msg._id;
            break;
          }
        }
      }

      // Third pass: quoted text is a prefix of the content (truncated quotes)
      if (!matchedMessageId) {
        for (const msg of nearbyMessages) {
          if (msg.content.startsWith(reaction.quotedText.slice(0, -1))) {
            matchedMessageId = msg._id;
            break;
          }
        }
      }

      await ctx.db.insert("reactions", {
        userId: userId as any,
        conversationId: args.conversationId,
        messageId: matchedMessageId as any,
        participantId: reaction.participantId as any,
        reactionType: reaction.reactionType,
        quotedText: reaction.quotedText,
        timestamp: reaction.timestamp,
      });

      // Mark the matched message as having reactions
      if (matchedMessageId) {
        await ctx.db.patch(matchedMessageId as any, { hasReactions: true });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Daily stats aggregation
// ---------------------------------------------------------------------------

export const aggregateDailyStats = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.import.computeDailyStats, {
        conversationId: args.conversationId,
      });

      await ctx.runMutation(internal.import.finalizeConversation, {
        conversationId: args.conversationId,
      });

      // Transition to embedding — users can browse while embeddings generate
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "embedding",
      });

      // Schedule background embedding generation
      await ctx.scheduler.runAfter(0, internal.embeddings.startEmbedding, {
        jobId: args.jobId,
        conversationId: args.conversationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: `Stats aggregation failed: ${message}`,
      });
    }
  },
});

export const computeDailyStats = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const userId = conversation.userId;

    // Fetch all messages for this conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    // Group by dateKey
    const dayGroups = new Map<
      string,
      { total: number; byConversation: number; byParticipant: Map<string, number> }
    >();

    for (const msg of messages) {
      let group = dayGroups.get(msg.dateKey);
      if (!group) {
        group = { total: 0, byConversation: 0, byParticipant: new Map() };
        dayGroups.set(msg.dateKey, group);
      }
      group.total++;
      group.byConversation++;
      const participantCount = group.byParticipant.get(msg.participantId) ?? 0;
      group.byParticipant.set(msg.participantId, participantCount + 1);
    }

    // Upsert dailyStats records
    for (const [dateKey, group] of dayGroups) {
      const existing = await ctx.db
        .query("dailyStats")
        .withIndex("by_userId_dateKey", (q) =>
          q.eq("userId", userId as any).eq("dateKey", dateKey)
        )
        .unique();

      const conversationBreakdownEntry = {
        conversationId: args.conversationId,
        count: group.byConversation,
      };

      const participantBreakdown = Array.from(group.byParticipant.entries()).map(
        ([participantId, count]) => ({
          participantId: participantId as any,
          count,
        })
      );

      if (existing) {
        // Merge with existing stats
        const existingConvBreakdown = existing.conversationBreakdown.filter(
          (c) => c.conversationId !== args.conversationId
        );
        existingConvBreakdown.push(conversationBreakdownEntry);

        // Merge participant breakdowns
        const mergedParticipants = new Map<string, number>();
        for (const entry of existing.participantBreakdown) {
          mergedParticipants.set(entry.participantId, entry.count);
        }
        for (const entry of participantBreakdown) {
          const current = mergedParticipants.get(entry.participantId) ?? 0;
          mergedParticipants.set(entry.participantId, current + entry.count);
        }

        await ctx.db.patch(existing._id, {
          totalMessages: existing.totalMessages + group.total,
          conversationBreakdown: existingConvBreakdown,
          participantBreakdown: Array.from(mergedParticipants.entries()).map(
            ([participantId, count]) => ({
              participantId: participantId as any,
              count,
            })
          ),
        });
      } else {
        await ctx.db.insert("dailyStats", {
          userId: userId as any,
          dateKey,
          totalMessages: group.total,
          conversationBreakdown: [conversationBreakdownEntry],
          participantBreakdown,
        });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Finalize conversation — update counts and date range
// ---------------------------------------------------------------------------

export const finalizeConversation = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }

    // Get all messages to compute date range and count
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    const messageCount = messages.length;

    let start = Infinity;
    let end = -Infinity;
    const participantCounts = new Map<string, number>();

    for (const msg of messages) {
      if (msg.timestamp < start) start = msg.timestamp;
      if (msg.timestamp > end) end = msg.timestamp;
      const count = participantCounts.get(msg.participantId) ?? 0;
      participantCounts.set(msg.participantId, count + 1);
    }

    // Handle edge case of no messages
    if (start === Infinity) start = Date.now();
    if (end === -Infinity) end = Date.now();

    // Update conversation
    await ctx.db.patch(args.conversationId, {
      messageCount,
      dateRange: { start, end },
    });

    // Update participant message counts and conversation counts
    for (const participantId of conversation.participantIds) {
      const participant = await ctx.db.get(participantId);
      if (!participant) continue;

      const messagesFromThisConvo = participantCounts.get(participantId) ?? 0;

      await ctx.db.patch(participantId, {
        messageCount: participant.messageCount + messagesFromThisConvo,
        conversationCount: participant.conversationCount + 1,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Create conversation record
// ---------------------------------------------------------------------------

export const createConversation = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    title: v.string(),
    isGroupChat: v.boolean(),
    participantIds: v.array(v.string()),
    sourceFilename: v.string(),
    metadata: v.optional(v.any()),
    totalMessages: v.number(),
  },
  handler: async (ctx, args) => {
    // Get userId from the import job
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error(`Import job ${args.jobId} not found`);
    }

    const conversationId = await ctx.db.insert("conversations", {
      userId: job.userId,
      title: args.title,
      isGroupChat: args.isGroupChat,
      participantIds: args.participantIds as any,
      dateRange: { start: 0, end: 0 },
      messageCount: 0,
      importedAt: Date.now(),
      sourceFilename: args.sourceFilename,
      metadata: args.metadata,
    });

    return conversationId;
  },
});
