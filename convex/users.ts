// ABOUTME: User management Convex functions — current user query and ensureUser mutation.
// ABOUTME: The ensureUser mutation triggers just-in-time user creation via getUserId.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Get the current authenticated user's record.
 * Returns null if the user hasn't been created yet (first visit).
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    return user;
  },
});

/**
 * Ensure the current user has a Convex record. Called on first authenticated
 * page load to trigger just-in-time user creation.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    return userId;
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.string(),
    realName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await ctx.db.patch(userId as any, {
      displayName: args.displayName,
      realName: args.realName,
    });
  },
});

export const updatePreferences = mutation({
  args: {
    defaultModel: v.string(),
    thinkingEnabled: v.boolean(),
    theme: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    await ctx.db.patch(userId as any, {
      preferences: {
        defaultModel: args.defaultModel,
        thinkingEnabled: args.thinkingEnabled,
        theme: args.theme,
      },
    });
  },
});
