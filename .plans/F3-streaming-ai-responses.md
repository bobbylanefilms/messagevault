# Handoff Plan: F3 — Streaming AI Responses

## 1. Problem Summary

Implement streaming AI responses using Claude API with `@convex-dev/persistent-text-streaming`. This involves setting up the Convex component infrastructure, creating an HTTP action endpoint for streaming, building the send-message action that orchestrates RAG retrieval + Anthropic API streaming, and handling extended thinking content, token usage tracking, and error states.

**Why:** Streaming is essential for chat UX — users need to see responses appearing in real time rather than waiting for the full response. The persistent-text-streaming component ensures responses are persisted in Convex for reload and cross-session access.

**Success Criteria:**
- AI responses stream in real time through Convex to the client
- User messages are persisted as `chatMessages` records
- Assistant messages are created with a `streamId` before streaming begins
- Extended thinking content is captured in a separate `thinkingContent` field
- Token usage (input/output) is recorded on each assistant message
- Stream status transitions: pending → streaming → done (or error)
- Failed API calls record an error message and update the stream status
- First token appears within 3 seconds of sending a query

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/node_modules/@convex-dev/persistent-text-streaming/` — Installed library. Key exports:
  - `PersistentTextStreaming` class (from `client`)
  - `useStream` hook (from `react`)
  - `StreamId`, `StreamIdValidator`, `StreamBody` types (from `client`)
- **No `convex/convex.config.ts`** — Must be created to register the persistent-text-streaming component
- **No `convex/http.ts`** — Must be created to expose the streaming HTTP endpoint
- `/Users/robert.sawyer/Git/messagevault/convex/chat.ts` — Will exist after F2, contains `assembleContext` and retrieval functions
- `/Users/robert.sawyer/Git/messagevault/convex/chatMessages.ts` — Will exist after F1, contains `listBySession` query
- `/Users/robert.sawyer/Git/messagevault/convex/chatSessions.ts` — Will exist after F1, contains session CRUD
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — `chatMessages` table has `streamId`, `thinkingContent`, `inputTokens`, `outputTokens`, `model`, `retrievedMessageIds`, `retrievalStrategy` fields
- `/Users/robert.sawyer/Git/messagevault/convex/lib/auth.ts` — Auth helper

### Persistent-Text-Streaming API

From the library's type definitions:

```typescript
class PersistentTextStreaming {
  constructor(component: UseApi<typeof api>);
  createStream(ctx: RunMutationCtx): Promise<StreamId>;
  getStreamBody(ctx: RunQueryCtx, streamId: StreamId): Promise<StreamBody>;
  stream<A>(ctx: A, request: Request, streamId: StreamId, streamWriter: StreamWriter<A>): Promise<Response>;
}

// StreamBody = { text: string; status: "pending" | "streaming" | "done" | "error" | "timeout" }
// useStream(queryRef, streamUrl, driven, streamId, opts?) → StreamBody
```

**Setup pattern (from README):**
1. Create `convex/convex.config.ts` registering the component
2. Create `PersistentTextStreaming` instance with `components.persistentTextStreaming`
3. Create HTTP action that calls `streaming.stream()` with a writer function
4. Register the HTTP route in `convex/http.ts`

### Dependencies

- **F1** — session management for creating/loading sessions
- **F2** — RAG pipeline for `assembleContext`
- **Anthropic API key** in Convex env vars
- **`@convex-dev/persistent-text-streaming`** — already installed (v0.3.0)
- **`@anthropic-ai/sdk`** — already installed (v0.80.0)

## 3. Detailed Step-by-Step Implementation

### Step 1: Create Convex Component Configuration (`convex/convex.config.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/convex.config.ts` (new file)

**Changes:** Register the persistent-text-streaming component with the Convex app.

```typescript
// ABOUTME: Convex app configuration — registers external components.
// ABOUTME: Persistent-text-streaming component enables real-time AI response streaming.

import { defineApp } from "convex/server";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config.js";

const app = defineApp();
app.use(persistentTextStreaming);
export default app;
```

**Why:** Convex components must be registered via `convex.config.ts` to be available. This creates the `components.persistentTextStreaming` reference needed by the streaming class.

**Edge cases:**
- After creating this file, `pnpm convex dev` will deploy the component tables (streams, chunks). This is a one-time schema addition.

**Verify:** Run `pnpm convex dev` — should deploy successfully with new component tables.

---

### Step 2: Add Send Message and Stream Mutations to `convex/chatMessages.ts`

**File:** `/Users/robert.sawyer/Git/messagevault/convex/chatMessages.ts` (update from F1)

**Changes:** Add mutations for creating user and assistant message records.

```typescript
// Add these imports at the top:
import { mutation, internalMutation } from "./_generated/server";

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

    // Verify session belongs to user
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== (userId as any)) {
      throw new Error("Session not found");
    }

    // Create user message
    const messageId = await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      userId: userId as any,
      role: "user",
      content: args.content,
    });

    // Update session activity and message count
    await ctx.db.patch(args.sessionId, {
      lastActivityAt: Date.now(),
      messageCount: session.messageCount + 1,
    });

    // Auto-generate title from first user message if session has no title
    if (!session.title) {
      const title = args.content.slice(0, 50) + (args.content.length > 50 ? "..." : "");
      await ctx.db.patch(args.sessionId, { title });
    }

    return messageId;
  },
});

/**
 * Create an assistant message placeholder with a stream ID.
 * Called before streaming begins.
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
      content: "", // Will be filled when stream completes
      model: args.model,
      streamId: args.streamId,
      retrievedMessageIds: args.retrievedMessageIds,
      retrievalStrategy: args.retrievalStrategy,
    });

    // Update session activity and message count
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
 * Finalize an assistant message after streaming completes.
 * Updates content, thinking, and token usage.
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
    if (args.outputTokens !== undefined) updates.outputTokens = args.outputTokens;

    await ctx.db.patch(args.messageId, updates);
  },
});
```

**Verify:** Mutations deploy and can be called from the Convex dashboard.

---

### Step 3: Create the Streaming Chat Action (`convex/chat.ts` — extend)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/chat.ts` (extend from F2)

**Changes:** Add the `streamResponse` HTTP action and the `PersistentTextStreaming` instance.

Add these imports and the streaming instance at the top of the file:

```typescript
import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";
import {
  PersistentTextStreaming,
  type StreamId,
} from "@convex-dev/persistent-text-streaming/client";

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);
```

Then add these functions:

#### a. `getStreamBody` (public query)

```typescript
/**
 * Public query to get stream body — used by the useStream React hook.
 */
export const getStreamBody = query({
  args: { streamId: v.string() },
  handler: async (ctx, args) => {
    return await streaming.getStreamBody(ctx, args.streamId as StreamId);
  },
});
```

#### b. `initiateChat` (public action)

The main entry point called by the client when the user sends a message.

```typescript
/**
 * Initiate a chat response: save user message, run RAG, create stream,
 * and kick off the streaming response.
 * Returns the streamId so the client can subscribe.
 */
export const initiateChat = action({
  args: {
    sessionId: v.id("chatSessions"),
    userMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Resolve userId
    const userId = await ctx.runQuery(internal.search.resolveUserId, {
      clerkId: identity.subject,
    });
    if (!userId) throw new Error("User not found");

    // Save user message
    await ctx.runMutation(api.chatMessages.sendUserMessage, {
      sessionId: args.sessionId,
      content: args.userMessage,
    });

    // Assemble RAG context
    const context = await ctx.runAction(internal.chat.assembleContext, {
      userQuery: args.userMessage,
      sessionId: args.sessionId,
      userId,
    });

    // Create stream
    const streamId = await streaming.createStream(ctx);

    // Create assistant message placeholder
    const assistantMessageId = await ctx.runMutation(
      internal.chatMessages.createAssistantMessage,
      {
        sessionId: args.sessionId,
        userId,
        model: (await ctx.runQuery(internal.chat.getSession, { sessionId: args.sessionId }))?.model ?? "claude-sonnet-4-6",
        streamId: streamId as string,
        retrievedMessageIds: context.retrievedMessageIds as any[],
        retrievalStrategy: context.strategy,
      }
    );

    // Schedule the streaming action
    await ctx.scheduler.runAfter(0, internal.chat.generateStreamingResponse, {
      streamId: streamId as string,
      assistantMessageId,
      systemPrompt: context.systemPrompt,
      formattedContext: context.formattedContext,
      chatHistory: context.chatHistory,
      model: (await ctx.runQuery(internal.chat.getSession, { sessionId: args.sessionId }))?.model ?? "claude-sonnet-4-6",
      thinkingEnabled: (await ctx.runQuery(internal.chat.getSession, { sessionId: args.sessionId }))?.thinkingEnabled ?? false,
    });

    return { streamId: streamId as string, assistantMessageId };
  },
});
```

#### c. `generateStreamingResponse` (internal action)

The actual Anthropic API call with streaming.

```typescript
/**
 * Internal action that calls Claude API with streaming and writes chunks
 * to the persistent text stream.
 */
export const generateStreamingResponse = internalAction({
  args: {
    streamId: v.string(),
    assistantMessageId: v.id("chatMessages"),
    systemPrompt: v.string(),
    formattedContext: v.string(),
    chatHistory: v.array(v.object({
      role: v.string(),
      content: v.string(),
    })),
    model: v.string(),
    thinkingEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });

    try {
      // Build messages array
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

      // Add chat history
      for (const msg of args.chatHistory) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }

      // The latest user message should already be in chatHistory from assembleContext,
      // but if not, it's in the formatted context.

      // Build system prompt with retrieved context
      const fullSystemPrompt = `${args.systemPrompt}\n\n## Retrieved Messages from Archive\n\n${args.formattedContext}`;

      // Build API params
      const params: any = {
        model: args.model,
        max_tokens: args.thinkingEnabled ? 16_000 : 8_192,
        system: fullSystemPrompt,
        messages,
        stream: true,
      };

      // Add extended thinking if enabled
      if (args.thinkingEnabled) {
        params.thinking = {
          type: "enabled",
          budget_tokens: 10_000,
        };
      }

      // Stream the response
      let fullText = "";
      let thinkingText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      const stream = await client.messages.stream(params);

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            fullText += event.delta.text;
            // Write chunk to persistent stream
            await ctx.runMutation(
              components.persistentTextStreaming.lib.addChunk,
              {
                streamId: args.streamId as any,
                text: event.delta.text,
                final: false,
              }
            );
          } else if (event.delta.type === "thinking_delta") {
            thinkingText += event.delta.thinking;
          }
        } else if (event.type === "message_delta") {
          // Final usage stats
          if (event.usage) {
            outputTokens = event.usage.output_tokens ?? 0;
          }
        } else if (event.type === "message_start") {
          if (event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0;
          }
        }
      }

      // Finalize the stream
      await ctx.runMutation(
        components.persistentTextStreaming.lib.addChunk,
        {
          streamId: args.streamId as any,
          text: "",
          final: true,
        }
      );

      await ctx.runMutation(
        components.persistentTextStreaming.lib.setStreamStatus,
        {
          streamId: args.streamId as any,
          status: "done",
        }
      );

      // Finalize the assistant message
      await ctx.runMutation(internal.chatMessages.finalizeAssistantMessage, {
        messageId: args.assistantMessageId,
        content: fullText,
        thinkingContent: thinkingText || undefined,
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Set stream to error state
      await ctx.runMutation(
        components.persistentTextStreaming.lib.setStreamStatus,
        {
          streamId: args.streamId as any,
          status: "error",
        }
      );

      // Save error in the assistant message
      await ctx.runMutation(internal.chatMessages.finalizeAssistantMessage, {
        messageId: args.assistantMessageId,
        content: `Error: ${errorMessage}`,
      });
    }
  },
});
```

**Why:** The architecture separates concerns: `initiateChat` handles user-facing orchestration (auth, save message, assemble context, create stream), while `generateStreamingResponse` handles the actual Anthropic API call. Using `scheduler.runAfter(0, ...)` ensures the streaming happens in a separate action invocation, preventing timeouts.

**Edge cases:**
- Extended thinking events use `thinking_delta` type — must be captured separately
- Token usage comes in `message_start` (input) and `message_delta` (output) events
- If Anthropic API fails, the stream status is set to "error" and the error message is saved
- The `addChunk` mutation with `final: true` signals stream completion

**Verify:** Deploying with `pnpm convex dev` should succeed. The streaming component tables will be created automatically.

---

### Step 4: Create HTTP Endpoint (`convex/http.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/http.ts` (new file)

**Changes:** Expose the streaming HTTP endpoint.

```typescript
// ABOUTME: HTTP routes for Convex — exposes streaming endpoint for AI chat responses.
// ABOUTME: Used by persistent-text-streaming component for real-time response delivery.

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";
import {
  PersistentTextStreaming,
  type StreamId,
} from "@convex-dev/persistent-text-streaming/client";

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

const http = httpRouter();

// Streaming chat endpoint — the persistent-text-streaming React hook
// calls this to establish an HTTP stream for real-time token delivery.
const streamChat = httpAction(async (ctx, request) => {
  const body = (await request.json()) as { streamId: string };

  // The streamWriter is a no-op here because the actual streaming is done
  // by the generateStreamingResponse internal action writing chunks directly.
  // This HTTP action just serves as the stream reader endpoint.
  const response = await streaming.stream(
    ctx,
    request,
    body.streamId as StreamId,
    async () => {
      // Chunks are written by generateStreamingResponse via scheduler
      // This writer doesn't need to do anything — the stream is driven
      // by the internal action, not by this HTTP handler.
    }
  );

  // CORS headers for cross-origin requests
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Vary", "Origin");
  return response;
});

http.route({
  path: "/chat-stream",
  method: "POST",
  handler: streamChat,
});

// CORS preflight
http.route({
  path: "/chat-stream",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

export default http;
```

**IMPORTANT NOTE:** The persistent-text-streaming library's `stream()` method may need the writer function to actually drive the streaming. If the library requires the writer to produce chunks (rather than having them written externally), the architecture needs adjustment:

**Alternative approach (if external chunk writing doesn't work):** Move the Anthropic API call into the HTTP action's `streamWriter` callback:

```typescript
const streamChat = httpAction(async (ctx, request) => {
  const body = (await request.json()) as {
    streamId: string;
    assistantMessageId: string;
    systemPrompt: string;
    formattedContext: string;
    chatHistory: Array<{ role: string; content: string }>;
    model: string;
    thinkingEnabled: boolean;
  };

  const response = await streaming.stream(
    ctx,
    request,
    body.streamId as StreamId,
    async (_ctx, _req, _id, append) => {
      // Call Anthropic API and stream chunks via append()
      // ... (move generateStreamingResponse logic here)
    }
  );

  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
});
```

The executor should test both approaches and use whichever works with the library's API. Check the library's example in `node_modules/@convex-dev/persistent-text-streaming/example/` for the canonical pattern.

**Verify:** Deploy and verify the HTTP endpoint is accessible at `{CONVEX_SITE_URL}/chat-stream`.

---

### Step 5: Create Environment Variable Helper

**File:** `/Users/robert.sawyer/Git/messagevault/lib/convex-url.ts` (new file)

```typescript
// ABOUTME: Helper to derive the Convex HTTP site URL from the cloud URL.
// ABOUTME: Used by the chat UI to construct the streaming endpoint URL.

/**
 * Convert a Convex cloud URL to the site (HTTP) URL.
 * Cloud URL format: https://xxx.convex.cloud
 * Site URL format: https://xxx.convex.site
 */
export function getConvexSiteUrl(): string {
  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!cloudUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  return cloudUrl.replace(".cloud", ".site");
}
```

**Why:** The `useStream` hook needs the full URL to the HTTP streaming endpoint. The Convex site URL is derived from the cloud URL by replacing `.cloud` with `.site`.

**Verify:** `getConvexSiteUrl()` returns a valid URL ending in `.site`.

## 4. Testing Strategy

### Manual Testing

1. **Component deployment:** Run `pnpm convex dev` — verify persistent-text-streaming component tables are created
2. **Stream creation:** Call `streaming.createStream()` via Convex dashboard — verify stream record created
3. **HTTP endpoint:** `curl -X POST {CONVEX_SITE_URL}/chat-stream -H "Content-Type: application/json" -d '{"streamId": "test"}' ` — verify endpoint responds (may error on invalid streamId, but should be reachable)
4. **Full flow:** Call `initiateChat` from a test page — verify:
   - User message saved to chatMessages
   - Assistant message created with streamId
   - Stream starts producing chunks
   - Final message has content, tokens, and strategy
5. **Extended thinking:** Enable thinking on a session, send a query — verify `thinkingContent` is populated
6. **Error handling:** Set an invalid API key temporarily — verify error is captured and stream status is "error"

### Type Checking

```bash
pnpm build  # After stopping dev server
```

## 5. Validation Checklist

- [ ] `convex/convex.config.ts` created and registers persistent-text-streaming
- [ ] `convex/http.ts` created with `/chat-stream` POST endpoint and CORS preflight
- [ ] `chatMessages.ts` has sendUserMessage, createAssistantMessage, finalizeAssistantMessage mutations
- [ ] `chat.ts` has getStreamBody query, initiateChat action, generateStreamingResponse internal action
- [ ] `lib/convex-url.ts` helper converts cloud URL to site URL
- [ ] Persistent-text-streaming component deploys successfully
- [ ] User messages are saved before streaming begins
- [ ] Assistant messages are created with streamId
- [ ] Anthropic API streaming works with chunk delivery
- [ ] Extended thinking content is captured separately
- [ ] Token usage (input/output) is recorded
- [ ] Stream status transitions correctly (pending → streaming → done)
- [ ] Error states are handled gracefully
- [ ] Session title auto-generates from first user message
- [ ] No TypeScript errors
- [ ] All files have ABOUTME comments

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| persistent-text-streaming `stream()` requires writer to produce chunks | Chunks written externally aren't delivered to HTTP stream | Move Anthropic streaming into the HTTP action's writer callback (alternative approach in Step 4) |
| Convex 10-minute action timeout | Long Anthropic responses | Claude responses typically complete within 60 seconds; if timeout occurs, the stream status will be "timeout" and the partial response is saved |
| CORS issues with HTTP endpoint | Browser blocks streaming requests | CORS headers set on both POST and OPTIONS routes |
| `components` import not available | TypeScript error | `components` is auto-generated after `convex.config.ts` is deployed — must run `pnpm convex dev` first |
| Anthropic SDK streaming API changes | Event types don't match | Check `@anthropic-ai/sdk` v0.80.0 streaming docs; event types are stable |
| Extended thinking not available on Haiku | API error if thinking enabled with Haiku | The model field is set per-session; validate that thinking is only enabled for Opus/Sonnet, or handle the API error gracefully |

## 7. Assumptions & Dependencies

- **F1 complete** — `chatSessions` and `chatMessages` tables exist with CRUD operations
- **F2 complete** — `assembleContext` function returns formatted RAG context
- **`@convex-dev/persistent-text-streaming` v0.3.0** installed and working
- **`@anthropic-ai/sdk` v0.80.0** installed with streaming support
- **ANTHROPIC_API_KEY** set in Convex environment variables
- **Convex HTTP actions** support long-running streaming (up to 10 minutes)
- **`components.persistentTextStreaming`** will be available after deploying `convex.config.ts`
- **The executor should check the library's example directory** (`node_modules/@convex-dev/persistent-text-streaming/example/`) if the chunk writing approach needs adjustment
- **Extended thinking API:** Uses `thinking: { type: "enabled", budget_tokens: 10000 }` parameter with Claude Opus/Sonnet models
