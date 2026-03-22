// ABOUTME: Shared auth gate for all user-facing Convex functions.
// ABOUTME: Verifies Clerk JWT identity, returns Convex userId with just-in-time user creation.

import { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

type QueryCtx = GenericQueryCtx<DataModel>;
type MutationCtx = GenericMutationCtx<DataModel>;

/**
 * Verify the Clerk identity from the request context and return the
 * authenticated user's Convex `_id`. Throws if not authenticated.
 *
 * For queries (read-only): looks up the existing user record.
 * For mutations: creates the user record just-in-time if it doesn't exist.
 */
export async function getUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const clerkId = identity.subject;

  // Look up existing user
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();

  if (existing) {
    return existing._id;
  }

  // For read-only contexts we can't create — this shouldn't normally happen
  // because the first operation is typically a mutation, but handle gracefully.
  if (!("insert" in ctx.db)) {
    throw new Error(
      "User record not found. Please perform a write operation first to create your account."
    );
  }

  // Just-in-time user creation
  const userId = await (ctx as MutationCtx).db.insert("users", {
    clerkId,
    displayName: identity.name ?? identity.email ?? "User",
    realName: identity.name ?? "",
    avatarUrl: identity.pictureUrl,
    preferences: {
      defaultModel: "claude-sonnet-4-6",
      thinkingEnabled: true,
      theme: "dark",
    },
  });

  return userId;
}
