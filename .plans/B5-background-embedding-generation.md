# B5: Background Embedding Generation — Execution Plan

## 1. Problem Summary

**What:** After B4's parsing completes, generate Voyage-3-lite semantic embeddings for all messages in the background. Uses batched API calls (100 messages per call) with rate limit handling. Users can browse immediately — embeddings power search and AI chat.

**Why:** Semantic embeddings enable vector search and RAG-powered AI chat — two of MessageVault's core features. Without embeddings, only keyword search is available and AI chat can't retrieve contextually relevant messages.

**Success criteria:**
- All messages get 1024-dimension Voyage-3-lite embeddings
- Embeddings use a 3-message contextual window for semantic richness
- Batched: 100 messages per Voyage API call
- Rate limits handled with exponential backoff via scheduler
- Progress tracked via `importJobs.embeddedMessages`
- Idempotent: messages with existing embeddings are skipped
- Import job transitions from "embedding" to "completed" when done

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Schema — `embedding` field on messages | **Read-only** |
| `/Users/robert.sawyer/Git/messagevault/convex/import.ts` | Import pipeline (from B4) | **Modify** — wire embedding trigger |
| `/Users/robert.sawyer/Git/messagevault/convex/importJobs.ts` | Import job tracking | **Read-only** — uses existing `updateProgress` with `embeddedMessages` |
| `/Users/robert.sawyer/Git/messagevault/package.json` | Dependencies — `voyageai` v0.2.1 installed | **Read-only** |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/lib/embeddings.ts` | Voyage AI client, embedding generation, contextual window construction |
| `convex/embeddings.ts` | Batched embedding action with scheduler chaining |

### Voyage AI SDK

The `voyageai` npm package (v0.2.1) is already installed. Usage:

```typescript
import { VoyageAIClient } from "voyageai";

const client = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY,
});

const result = await client.embed({
  input: ["text to embed", "another text"],
  model: "voyage-3-lite",
  inputType: "document", // or "query" for search queries
});
// result.data[0].embedding -> number[] (1024 dimensions)
```

**Important:** The executor should verify the actual SDK exports by checking `node_modules/voyageai/dist/index.d.ts`. The import may be `import VoyageAIClient from "voyageai"` (default export) rather than named export.

### Environment Variables

`VOYAGE_API_KEY` must be set in the Convex dashboard (not `.env.local`). Convex actions access environment variables via `process.env`.

## 3. Detailed Step-by-Step Implementation

### Step 1: Create the embeddings utility module

**File:** `/Users/robert.sawyer/Git/messagevault/convex/lib/embeddings.ts` (new)

```typescript
// ABOUTME: Voyage AI embedding generation for message semantic search.
// ABOUTME: Builds contextual windows (prev + current + next) and batches API calls.

import { VoyageAIClient } from "voyageai";

let client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient {
  if (!client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error("VOYAGE_API_KEY not set in Convex environment variables");
    client = new VoyageAIClient({ apiKey });
  }
  return client;
}

/**
 * Message data needed for contextual window construction.
 */
export interface MessageForEmbedding {
  id: string;
  senderName: string;
  content: string;
  dateKey: string;
}

/**
 * Build the contextual embedding text for a message.
 * Format: "[Sender] on [Date]:\n[prev content]\n[current content]\n[next content]"
 *
 * The contextual window gives semantic meaning to short replies like "ok", "lol", "sure"
 * by embedding them alongside their conversational context.
 */
export function buildContextualText(
  current: MessageForEmbedding,
  prev: MessageForEmbedding | null,
  next: MessageForEmbedding | null
): string {
  const parts: string[] = [];

  parts.push(`${current.senderName} on ${current.dateKey}:`);

  if (prev) {
    parts.push(prev.content);
  }
  parts.push(current.content);
  if (next) {
    parts.push(next.content);
  }

  return parts.join("\n");
}

/**
 * Generate embeddings for a batch of texts using Voyage-3-lite.
 * Returns 1024-dimension float arrays.
 *
 * @param texts - Array of strings to embed (max ~100 per call for efficiency)
 * @returns Array of 1024-dimension embedding vectors
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const voyageClient = getClient();

  const result = await voyageClient.embed({
    input: texts,
    model: "voyage-3-lite",
    inputType: "document",
  });

  if (!result.data) {
    throw new Error("Voyage API returned no data");
  }

  return result.data.map((item) => {
    if (!item.embedding) throw new Error("Missing embedding in response");
    return item.embedding;
  });
}

/**
 * Generate a single embedding for a search query.
 * Uses "query" input type for asymmetric search (queries are embedded differently
 * from documents for better retrieval quality).
 */
export async function generateQueryEmbedding(
  query: string
): Promise<number[]> {
  const voyageClient = getClient();

  const result = await voyageClient.embed({
    input: [query],
    model: "voyage-3-lite",
    inputType: "query",
  });

  if (!result.data?.[0]?.embedding) {
    throw new Error("Voyage API returned no embedding for query");
  }

  return result.data[0].embedding;
}
```

### Step 2: Create the batched embedding action

**File:** `/Users/robert.sawyer/Git/messagevault/convex/embeddings.ts` (new)

```typescript
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

/**
 * Start embedding generation for a conversation.
 * Called by the import pipeline after parsing and stats aggregation complete.
 */
export const startEmbedding = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    // Count messages without embeddings
    const totalToEmbed = await ctx.runQuery(
      internal.embeddings.countUnembeddedMessages,
      { conversationId: args.conversationId }
    );

    if (totalToEmbed === 0) {
      // All messages already embedded — mark complete
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "completed",
        completedAt: Date.now(),
      });
      return;
    }

    // Process first batch
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

/**
 * Process a batch of messages: build contextual texts, call Voyage API,
 * write embeddings back. Schedule next batch or complete.
 */
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
      // Get messages for this batch with surrounding context
      const batchData = await ctx.runQuery(
        internal.embeddings.getMessageBatch,
        {
          conversationId: args.conversationId,
          offset: args.offset,
          limit: EMBED_BATCH_SIZE,
        }
      );

      if (batchData.messages.length === 0) {
        // Done — mark job as completed
        await ctx.runMutation(internal.importJobs.updateStatus, {
          jobId: args.jobId,
          status: "completed",
          completedAt: Date.now(),
        });
        return;
      }

      // Build contextual texts for each message
      const texts: string[] = [];
      const messageIds: string[] = [];

      for (let i = 0; i < batchData.messages.length; i++) {
        const msg = batchData.messages[i]!;
        const prev =
          i > 0 ? batchData.messages[i - 1]! : batchData.prevContext;
        const next =
          i < batchData.messages.length - 1
            ? batchData.messages[i + 1]!
            : batchData.nextContext;

        texts.push(buildContextualText(msg, prev ?? null, next ?? null));
        messageIds.push(msg.id);
      }

      // Call Voyage API
      const embeddings = await generateEmbeddings(texts);

      // Write embeddings back to message records
      await ctx.runMutation(internal.embeddings.writeEmbeddings, {
        messageIds,
        embeddings,
      });

      // Update progress
      const newEmbeddedCount = args.embeddedSoFar + batchData.messages.length;
      await ctx.runMutation(internal.importJobs.updateProgress, {
        jobId: args.jobId,
        embeddedMessages: newEmbeddedCount,
      });

      if (newEmbeddedCount < args.totalToEmbed) {
        // Schedule next batch (reset retry count on success)
        await ctx.scheduler.runAfter(0, internal.embeddings.processBatch, {
          jobId: args.jobId,
          conversationId: args.conversationId,
          offset: args.offset + EMBED_BATCH_SIZE,
          totalToEmbed: args.totalToEmbed,
          embeddedSoFar: newEmbeddedCount,
          retryCount: 0,
        });
      } else {
        // All done
        await ctx.runMutation(internal.importJobs.updateStatus, {
          jobId: args.jobId,
          status: "completed",
          completedAt: Date.now(),
        });
      }
    } catch (error) {
      // Check for rate limiting (429)
      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") || error.message.includes("rate limit"));

      if (isRateLimit && args.retryCount < 5) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
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
          error: error instanceof Error
            ? error.message
            : "Embedding generation failed",
        });
      }
    }
  },
});

// --- Supporting queries and mutations ---

/**
 * Count messages in a conversation that don't have embeddings yet.
 */
export const countUnembeddedMessages = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    return messages.filter((m) => !m.embedding).length;
  },
});

/**
 * Get a batch of messages for embedding, with surrounding context messages.
 * Returns messages that don't have embeddings yet, plus the message before
 * and after the batch for building contextual windows.
 */
export const getMessageBatch = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    offset: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    // Get ALL messages in timestamp order (we need ordered access for context)
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    // Filter to unembedded messages
    const unembedded = allMessages.filter((m) => !m.embedding);

    // Get the batch slice
    const batch = unembedded.slice(args.offset, args.offset + args.limit);

    if (batch.length === 0) {
      return { messages: [], prevContext: null, nextContext: null };
    }

    // Build MessageForEmbedding objects
    const messages: MessageForEmbedding[] = batch.map((m) => ({
      id: m._id,
      senderName: m.senderName,
      content: m.content,
      dateKey: m.dateKey,
    }));

    // Find surrounding context from the full ordered message list
    // (not just unembedded — we want actual conversational neighbors)
    const firstBatchIdx = allMessages.findIndex(
      (m) => m._id === batch[0]!._id
    );
    const lastBatchIdx = allMessages.findIndex(
      (m) => m._id === batch[batch.length - 1]!._id
    );

    const prevMsg = firstBatchIdx > 0 ? allMessages[firstBatchIdx - 1] : null;
    const nextMsg =
      lastBatchIdx < allMessages.length - 1
        ? allMessages[lastBatchIdx + 1]
        : null;

    const prevContext: MessageForEmbedding | null = prevMsg
      ? {
          id: prevMsg._id,
          senderName: prevMsg.senderName,
          content: prevMsg.content,
          dateKey: prevMsg.dateKey,
        }
      : null;

    const nextContext: MessageForEmbedding | null = nextMsg
      ? {
          id: nextMsg._id,
          senderName: nextMsg.senderName,
          content: nextMsg.content,
          dateKey: nextMsg.dateKey,
        }
      : null;

    return { messages, prevContext, nextContext };
  },
});

/**
 * Write embedding vectors back to message records.
 */
export const writeEmbeddings = internalMutation({
  args: {
    messageIds: v.array(v.string()),
    embeddings: v.any(), // number[][] — array of 1024-dim vectors
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < args.messageIds.length; i++) {
      const messageId = args.messageIds[i]!;
      const embedding = args.embeddings[i];
      if (embedding) {
        await ctx.db.patch(messageId as any, { embedding });
      }
    }
  },
});
```

### Step 3: Wire B5 into the import pipeline

**File:** `/Users/robert.sawyer/Git/messagevault/convex/import.ts`

In the `aggregateDailyStats` handler, after stats are computed and conversation is finalized, replace the status update with a call to start embedding generation:

```typescript
// In aggregateDailyStats handler, after finalizeConversation:

// Transition to embedding status
await ctx.runMutation(internal.importJobs.updateStatus, {
  jobId: args.jobId,
  status: "embedding",
});

// Schedule background embedding generation
await ctx.scheduler.runAfter(0, internal.embeddings.startEmbedding, {
  jobId: args.jobId,
  conversationId: args.conversationId,
});
```

### Step 4: Verify the `updateProgress` mutation handles `embeddedMessages`

The B4 plan already includes `embeddedMessages: v.optional(v.number())` in the `updateProgress` args. Verify this is present. If not, add it.

## 4. Testing Strategy

1. Import a file and verify embedding generation starts after parsing completes
2. Check Convex dashboard — messages should have `embedding` arrays (1024 floats each)
3. Verify contextual window format: check a few embedding inputs to confirm they include prev/current/next
4. Verify progress counter increments: `importJobs.embeddedMessages` should increase as batches complete
5. Verify idempotency: running the import pipeline again on the same conversation skips already-embedded messages
6. Test rate limit handling: if the Voyage API returns 429, verify the action retries with backoff
7. Verify job transitions to "completed" status after all embeddings are written
8. Verify the vector index is queryable: use the Convex dashboard to run a vector search

## 5. Validation Checklist

- [ ] `convex/lib/embeddings.ts` created with Voyage client, contextual text builder, query embedding
- [ ] `convex/embeddings.ts` created with batched action, scheduler chaining, supporting queries/mutations
- [ ] Contextual window includes prev + current + next message content
- [ ] 100 messages per Voyage API call
- [ ] Rate limit handling with exponential backoff (up to 5 retries)
- [ ] Progress tracked via `embeddedMessages` counter on importJobs
- [ ] Idempotent — skips messages that already have embeddings
- [ ] Import job transitions to "completed" when all embeddings written
- [ ] Wired into import pipeline: `aggregateDailyStats` schedules `startEmbedding`
- [ ] `generateQueryEmbedding` available for future search/chat features (E2, F2)
- [ ] ABOUTME comments on all new files
- [ ] No TypeScript errors

## 6. Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| `VOYAGE_API_KEY` not set in Convex env | Check early and throw descriptive error. Document the setup requirement. |
| Voyage API rate limits (free tier: ~300 req/min) | Exponential backoff up to 5 retries (1s, 2s, 4s, 8s, 16s). At 100 msgs/call, 15K messages = 150 calls = ~75 seconds without rate limiting. |
| Large conversations (15K messages) take time | Each batch is a separate action via scheduler. No single action times out. Total time ~2-5 minutes for 15K messages. |
| `voyageai` SDK export differences | Check `node_modules/voyageai/dist/index.d.ts` for actual export names. May need `import VoyageAIClient from "voyageai"` (default) instead of named. |
| Convex `internalQuery` availability | Verify `internalQuery` exists in Convex SDK v1.34.0. If not, use `query` with manual auth checks. Alternative: use `ctx.runQuery` with a regular query that accepts `conversationId`. |
| `getMessageBatch` loads all messages into memory | For very large conversations (100K+ messages), this could be slow. Optimize by using cursor-based pagination instead of `.collect()`. For the expected scale (15K messages), this is fine. |
| Embedding vectors are large (1024 floats per message) | Each embedding is ~8KB. 15K messages = ~120MB of embedding data. Convex handles this fine but be aware of storage costs. |

## 7. Assumptions & Dependencies

- **B1-B4 are complete** — messages exist in the database, import pipeline is functional
- **`VOYAGE_API_KEY`** is set in Convex dashboard environment variables
- **Voyage-3-lite model** is available and returns 1024-dimension embeddings
- **Convex vector index** on messages (`by_embedding`, 1024 dimensions, cosine) is deployed
- **The `voyageai` npm package** (v0.2.1) works in the Convex action runtime (Node.js)
- **`internalQuery`, `internalAction`, `internalMutation`** are available in Convex SDK v1.34.0
