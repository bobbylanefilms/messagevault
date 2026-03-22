// ABOUTME: Daily stats queries for calendar heatmap — fetch stats by year and date range bounds.
// ABOUTME: Provides listByYear for heatmap data and getDateRange for year selector constraints.

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Fetch all dailyStats records for a given year, scoped to the authenticated user.
 * Uses the by_userId_dateKey index with range filter on dateKey strings.
 */
export const listByYear = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const startKey = `${args.year}-01-01`;
    const endKey = `${args.year}-12-31`;

    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q
          .eq("userId", userId as any)
          .gte("dateKey", startKey)
          .lte("dateKey", endKey)
      )
      .collect();

    return stats;
  },
});

/**
 * Find the earliest and latest years that have dailyStats data for the current user.
 * Returns null if no data exists.
 */
export const getDateRange = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    // Get the earliest record (ascending order by dateKey)
    const earliest = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any)
      )
      .first();

    if (!earliest) {
      return null;
    }

    // Get the latest record (descending order by dateKey)
    const latest = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any)
      )
      .order("desc")
      .first();

    const earliestYear = parseInt(earliest.dateKey.substring(0, 4), 10);
    const latestYear = latest
      ? parseInt(latest.dateKey.substring(0, 4), 10)
      : earliestYear;

    return { earliestYear, latestYear };
  },
});

/**
 * Get the previous day with messages before the given dateKey.
 */
export const getPreviousDay = query({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any).lt("dateKey", args.dateKey)
      )
      .order("desc")
      .first();

    return stats?.dateKey ?? null;
  },
});

/**
 * Get the next day with messages after the given dateKey.
 */
export const getNextDay = query({
  args: { dateKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const stat = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", userId as any).gt("dateKey", args.dateKey)
      )
      .first();

    return stat?.dateKey ?? null;
  },
});
