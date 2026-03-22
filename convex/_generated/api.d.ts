/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chat from "../chat.js";
import type * as chatMessages from "../chatMessages.js";
import type * as chatSessions from "../chatSessions.js";
import type * as conversations from "../conversations.js";
import type * as dailyStats from "../dailyStats.js";
import type * as dashboard from "../dashboard.js";
import type * as dataManagement from "../dataManagement.js";
import type * as embeddings from "../embeddings.js";
import type * as http from "../http.js";
import type * as import_ from "../import.js";
import type * as importJobs from "../importJobs.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_embeddings from "../lib/embeddings.js";
import type * as lib_parser from "../lib/parser.js";
import type * as lib_rag from "../lib/rag.js";
import type * as messages from "../messages.js";
import type * as participants from "../participants.js";
import type * as reactions from "../reactions.js";
import type * as search from "../search.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chat: typeof chat;
  chatMessages: typeof chatMessages;
  chatSessions: typeof chatSessions;
  conversations: typeof conversations;
  dailyStats: typeof dailyStats;
  dashboard: typeof dashboard;
  dataManagement: typeof dataManagement;
  embeddings: typeof embeddings;
  http: typeof http;
  import: typeof import_;
  importJobs: typeof importJobs;
  "lib/auth": typeof lib_auth;
  "lib/embeddings": typeof lib_embeddings;
  "lib/parser": typeof lib_parser;
  "lib/rag": typeof lib_rag;
  messages: typeof messages;
  participants: typeof participants;
  reactions: typeof reactions;
  search: typeof search;
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

export declare const components: {
  persistentTextStreaming: {
    lib: {
      addChunk: FunctionReference<
        "mutation",
        "internal",
        { final: boolean; streamId: string; text: string },
        any
      >;
      createStream: FunctionReference<"mutation", "internal", {}, any>;
      getStreamStatus: FunctionReference<
        "query",
        "internal",
        { streamId: string },
        "pending" | "streaming" | "done" | "error" | "timeout"
      >;
      getStreamText: FunctionReference<
        "query",
        "internal",
        { streamId: string },
        {
          status: "pending" | "streaming" | "done" | "error" | "timeout";
          text: string;
        }
      >;
      setStreamStatus: FunctionReference<
        "mutation",
        "internal",
        {
          status: "pending" | "streaming" | "done" | "error" | "timeout";
          streamId: string;
        },
        any
      >;
    };
  };
};
