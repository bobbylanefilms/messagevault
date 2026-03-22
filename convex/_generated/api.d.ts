/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as conversations from "../conversations.js";
import type * as dailyStats from "../dailyStats.js";
import type * as embeddings from "../embeddings.js";
import type * as import_ from "../import.js";
import type * as importJobs from "../importJobs.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_embeddings from "../lib/embeddings.js";
import type * as lib_parser from "../lib/parser.js";
import type * as messages from "../messages.js";
import type * as participants from "../participants.js";
import type * as reactions from "../reactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  conversations: typeof conversations;
  dailyStats: typeof dailyStats;
  embeddings: typeof embeddings;
  import: typeof import_;
  importJobs: typeof importJobs;
  "lib/auth": typeof lib_auth;
  "lib/embeddings": typeof lib_embeddings;
  "lib/parser": typeof lib_parser;
  messages: typeof messages;
  participants: typeof participants;
  reactions: typeof reactions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
