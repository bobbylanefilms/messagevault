// ABOUTME: Import job management — create, update, list, and query import progress.
// ABOUTME: Import jobs track the full lifecycle of a file import from upload through embedding.

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

export const create = mutation({
  args: {
    sourceFilename: v.string(),
    totalLines: v.number(),
    fileContent: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const jobId = await ctx.db.insert("importJobs", {
      userId: userId as any,
      status: "uploading",
      sourceFilename: args.sourceFilename,
      totalLines: args.totalLines,
      parsedMessages: 0,
      skippedDuplicates: 0,
      embeddedMessages: 0,
      totalMessages: 0,
      startedAt: Date.now(),
    });

    return jobId;
  },
});

export const get = query({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || job.userId !== user._id) return null;
    return job;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const jobs = await ctx.db
      .query("importJobs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return jobs;
  },
});

export const updateStatus = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    status: v.union(
      v.literal("uploading"),
      v.literal("parsing"),
      v.literal("embedding"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.error !== undefined) patch.error = args.error;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
    await ctx.db.patch(args.jobId, patch);
  },
});

export const updateProgress = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    parsedMessages: v.optional(v.number()),
    skippedDuplicates: v.optional(v.number()),
    embeddedMessages: v.optional(v.number()),
    totalMessages: v.optional(v.number()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.parsedMessages !== undefined) patch.parsedMessages = args.parsedMessages;
    if (args.skippedDuplicates !== undefined) patch.skippedDuplicates = args.skippedDuplicates;
    if (args.embeddedMessages !== undefined) patch.embeddedMessages = args.embeddedMessages;
    if (args.totalMessages !== undefined) patch.totalMessages = args.totalMessages;
    if (args.conversationId !== undefined) patch.conversationId = args.conversationId;
    await ctx.db.patch(args.jobId, patch);
  },
});
