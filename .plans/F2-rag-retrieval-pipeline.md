# Handoff Plan: F2 — RAG Retrieval Pipeline

## 1. Problem Summary

Build the retrieval-augmented generation (RAG) pipeline that assembles relevant message context for AI chat responses. This includes query classification (via Haiku), date-based retrieval, vector-based retrieval with context expansion, hybrid merging, context window budget management, and prompt formatting.

**Why:** The RAG pipeline is the intelligence behind AI chat — without it, the AI has no access to the user's message archive. Quality retrieval directly determines response quality.

**Success Criteria:**
- Query classification correctly categorizes queries as `date_load`, `vector`, or `hybrid`
- Date-specific queries load all messages for the specified date(s)
- Topical queries return semantically relevant messages via vector search with ±5 message context expansion
- Hybrid queries combine both strategies with deduplication
- Context window management respects token budgets per model
- Retrieved messages are formatted with sender, date, and conversation context
- System prompt establishes warm, personal archive explorer persona

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/convex/search.ts` — Existing search engine with `semanticSearch` (internal action), `hybridSearch` (public action), `resolveUserId`, `getMessagesByIds`, `getSurroundingMessages`. Several of these helpers can be reused or adapted.
- `/Users/robert.sawyer/Git/messagevault/convex/lib/embeddings.ts` — `generateQueryEmbedding(query)` function for embedding user queries with Voyage-3-lite. Already used by semantic search.
- `/Users/robert.sawyer/Git/messagevault/convex/messages.ts` — Has `listByDateKey` query for loading messages by date. Also `keywordSearch` for full-text search.
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — Schema with all indexes needed: `by_userId_dateKey`, `by_conversationId_dateKey`, `by_conversationId_timestamp`, vector index `by_embedding`.
- `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` — `list` and `get` queries for conversation metadata.
- `/Users/robert.sawyer/Git/messagevault/convex/chatSessions.ts` — Will exist after F1, provides session scope (contextScope field).

### Existing Patterns

- Search uses `internalAction` for operations that call external APIs (Voyage)
- `resolveUserId` internal query resolves Clerk subject to Convex userId
- `getMessagesByIds` fetches full documents from vector search result IDs
- `getSurroundingMessages` gets context around a target message — can be reused for ±5 expansion
- Vector search limited to 256 results per query (Convex constraint)
- Post-filtering for date ranges since Convex vector search only supports equality filters

### Dependencies

- **F1 (Chat Session Management)** — provides session scope for retrieval boundaries
- **E2 (Semantic Search)** — vector search infrastructure already in place
- **B5 (Embeddings)** — messages must have embeddings for vector search to work
- **Anthropic API key** — needed for query classification (Haiku)
- **Voyage API key** — needed for embedding user queries

## 3. Detailed Step-by-Step Implementation

### Step 1: Create RAG Library (`convex/lib/rag.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/lib/rag.ts` (new file)

**Changes:** Create the core RAG utilities — query classification prompt, system prompt, context formatting, and token budget management.

```typescript
// ABOUTME: RAG pipeline utilities — query classification, context formatting, token management.
// ABOUTME: Core library used by the chat action to assemble AI prompts from message archives.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MODELS = {
  "claude-opus-4-6": { contextWindow: 200_000, name: "Claude Opus 4.6" },
  "claude-sonnet-4-6": { contextWindow: 200_000, name: "Claude Sonnet 4.6" },
  "claude-haiku-4-5": { contextWindow: 200_000, name: "Claude Haiku 4.5" },
} as const;

export type ModelId = keyof typeof MODELS;

export const RESPONSE_BUDGET = 8_192;
export const THINKING_RESPONSE_BUDGET = 16_000;
export const SYSTEM_PROMPT_BUDGET = 500;
export const MAX_CHAT_HISTORY_TOKENS = 5_000;
export const CHAT_HISTORY_RATIO = 0.1; // 10% of available

export type RetrievalStrategy = "date_load" | "vector" | "hybrid";

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Approximate token count: ~4 characters per token */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are a personal message archive explorer for a family's text message history. You have access to years of real conversations imported from Apple Messages.

Your role:
- Answer questions about the message archive with warmth and specificity
- Quote exact messages when relevant, including sender names and dates
- Provide context about conversation patterns, relationships, and recurring topics
- Be conversational and warm — these are family messages, treat them with the intimacy they deserve
- When you don't have enough context to fully answer, say so honestly and suggest what the user might search for

Guidelines:
- Always cite specific messages with dates and senders when available
- If asked about a date range, summarize the key topics and notable exchanges
- Distinguish between what the messages show vs. your interpretation
- Respect the personal nature of the content — be helpful but not invasive
- If the retrieved context doesn't contain relevant information, say so rather than making things up

You will be provided with retrieved message excerpts as context. Base your responses on this context.`;

// ---------------------------------------------------------------------------
// Query classification prompt
// ---------------------------------------------------------------------------

export function buildClassificationPrompt(userQuery: string): string {
  return `Classify this user query about their personal message archive into a retrieval strategy.

Strategies:
- "date_load": The query asks about a specific date, day, or date range. Examples: "What did we talk about on Christmas 2023?", "Show me messages from last July", "What happened on March 15?"
- "vector": The query asks about a topic, person, event, or theme without specifying dates. Examples: "What conversations have we had about vacation?", "Find messages about the dog", "What's the funniest thing Mom said?"
- "hybrid": The query combines a topic with a time reference, or is ambiguous. Examples: "What did we discuss about the move in 2024?", "Conversations about cooking from last summer"

Respond with ONLY one word: date_load, vector, or hybrid

User query: "${userQuery}"`;
}

// ---------------------------------------------------------------------------
// Date extraction
// ---------------------------------------------------------------------------

/**
 * Build a prompt for Haiku to extract date references from a user query.
 * Returns ISO date strings (YYYY-MM-DD) or date ranges.
 */
export function buildDateExtractionPrompt(userQuery: string, currentDate: string): string {
  return `Extract specific dates or date ranges from this query about a message archive. Today's date is ${currentDate}.

Respond in JSON format: {"dates": ["YYYY-MM-DD"], "range": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} | null}

If the query mentions:
- A specific date → include it in "dates"
- "Christmas 2023" → {"dates": ["2023-12-25"], "range": null}
- "last July" → {"dates": [], "range": {"start": "2025-07-01", "end": "2025-07-31"}}  (relative to current date)
- "March 15" without a year → assume the most recent past occurrence
- No specific dates → {"dates": [], "range": null}

User query: "${userQuery}"`;
}

// ---------------------------------------------------------------------------
// Context formatting
// ---------------------------------------------------------------------------

interface RetrievedMessage {
  _id: string;
  senderName: string;
  content: string;
  timestamp: number;
  dateKey: string;
  conversationId: string;
  conversationTitle?: string;
}

/**
 * Format retrieved messages into a prompt-ready string, grouped by date and conversation.
 */
export function formatRetrievedContext(messages: RetrievedMessage[]): string {
  if (messages.length === 0) return "[No relevant messages found in the archive.]";

  // Sort chronologically
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  // Group by date, then by conversation
  const byDate = new Map<string, Map<string, RetrievedMessage[]>>();

  for (const msg of sorted) {
    if (!byDate.has(msg.dateKey)) {
      byDate.set(msg.dateKey, new Map());
    }
    const dateGroup = byDate.get(msg.dateKey)!;
    const convTitle = msg.conversationTitle ?? msg.conversationId;
    if (!dateGroup.has(convTitle)) {
      dateGroup.set(convTitle, []);
    }
    dateGroup.get(convTitle)!.push(msg);
  }

  const parts: string[] = [];

  for (const [dateKey, conversations] of byDate) {
    const dateStr = new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    parts.push(`\n--- ${dateStr} ---`);

    for (const [convTitle, msgs] of conversations) {
      if (conversations.size > 1) {
        parts.push(`[${convTitle}]`);
      }
      for (const msg of msgs) {
        const time = new Date(msg.timestamp).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        parts.push(`${time} - ${msg.senderName}: ${msg.content}`);
      }
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Token budget allocation
// ---------------------------------------------------------------------------

interface TokenBudget {
  systemPrompt: number;
  chatHistory: number;
  retrievedContext: number;
  responseBudget: number;
}

export function calculateTokenBudget(
  modelId: ModelId,
  thinkingEnabled: boolean
): TokenBudget {
  const model = MODELS[modelId];
  const responseBudget = thinkingEnabled ? THINKING_RESPONSE_BUDGET : RESPONSE_BUDGET;
  const available = model.contextWindow - responseBudget;

  const systemPrompt = SYSTEM_PROMPT_BUDGET;
  const chatHistory = Math.min(
    MAX_CHAT_HISTORY_TOKENS,
    Math.floor(available * CHAT_HISTORY_RATIO)
  );
  const retrievedContext = available - systemPrompt - chatHistory;

  return {
    systemPrompt,
    chatHistory,
    retrievedContext,
    responseBudget,
  };
}

/**
 * Truncate chat history to fit within token budget.
 * Keeps the most recent messages, dropping oldest first.
 */
export function truncateChatHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Array<{ role: string; content: string }> {
  let totalTokens = 0;
  const kept: Array<{ role: string; content: string }> = [];

  // Iterate from most recent to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const msgTokens = estimateTokens(msg.content) + 10; // overhead per message
    if (totalTokens + msgTokens > maxTokens) break;
    totalTokens += msgTokens;
    kept.unshift(msg);
  }

  return kept;
}

/**
 * Truncate retrieved context to fit within token budget.
 * Prioritizes by: highest similarity score → complete days → recency.
 */
export function truncateRetrievedMessages(
  messages: RetrievedMessage[],
  maxTokens: number
): RetrievedMessage[] {
  const kept: RetrievedMessage[] = [];
  let totalTokens = 0;

  for (const msg of messages) {
    const msgTokens = estimateTokens(
      `${msg.senderName}: ${msg.content}`
    ) + 5; // overhead
    if (totalTokens + msgTokens > maxTokens) break;
    totalTokens += msgTokens;
    kept.push(msg);
  }

  return kept;
}
```

**Why:** Centralizes all RAG logic in a testable library. Separating from Convex actions makes the logic reusable and easier to reason about.

**Edge cases:**
- Token estimation is approximate (4 chars = 1 token) — intentionally conservative
- Date extraction prompt handles relative dates ("last July") with current date context
- Empty retrieval results return a clear "no messages found" indicator

**Verify:** Import the module — all functions should compile without TypeScript errors.

---

### Step 2: Create RAG Retrieval Action (`convex/chat.ts`)

**File:** `/Users/robert.sawyer/Git/messagevault/convex/chat.ts` (new file)

**Changes:** Create the main RAG action that classifies queries and retrieves relevant messages. This action will also be extended in F3 for streaming.

```typescript
// ABOUTME: AI chat actions — query classification, RAG retrieval, and response generation.
// ABOUTME: Orchestrates the full chat pipeline: classify → retrieve → format → stream response.

import { action, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  buildClassificationPrompt,
  buildDateExtractionPrompt,
  formatRetrievedContext,
  calculateTokenBudget,
  truncateChatHistory,
  truncateRetrievedMessages,
  estimateTokens,
  SYSTEM_PROMPT,
  type RetrievalStrategy,
  type ModelId,
} from "./lib/rag";
import { generateQueryEmbedding } from "./lib/embeddings";
```

**Key functions to implement:**

#### a. `classifyQuery` (internal action)

Calls Haiku to classify the user's query into a retrieval strategy.

```typescript
export const classifyQuery = internalAction({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });
    const prompt = buildClassificationPrompt(args.query);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text"
      ? response.content[0].text.trim().toLowerCase()
      : "hybrid";

    if (text === "date_load" || text === "vector" || text === "hybrid") {
      return text as RetrievalStrategy;
    }
    return "hybrid" as RetrievalStrategy; // fallback
  },
});
```

#### b. `extractDates` (internal action)

Calls Haiku to extract specific dates from the query for date_load strategy.

```typescript
export const extractDates = internalAction({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });
    const currentDate = new Date().toISOString().split("T")[0]!;
    const prompt = buildDateExtractionPrompt(args.query, currentDate);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "{}";

    try {
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { dates: [] as string[], range: null };
      return JSON.parse(jsonMatch[0]) as {
        dates: string[];
        range: { start: string; end: string } | null;
      };
    } catch {
      return { dates: [] as string[], range: null };
    }
  },
});
```

#### c. `retrieveByDate` (internal query)

Loads all messages for specific dates, optionally scoped to conversations/participants.

```typescript
export const retrieveByDate = internalQuery({
  args: {
    userId: v.string(),
    dateKeys: v.array(v.string()),
    conversationIds: v.optional(v.array(v.string())),
    participantIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const allMessages = [];

    for (const dateKey of args.dateKeys) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_userId_dateKey", (q) =>
          q.eq("userId", args.userId as any).eq("dateKey", dateKey)
        )
        .collect();
      allMessages.push(...messages);
    }

    // Apply scope filters
    let filtered = allMessages;
    if (args.conversationIds?.length) {
      const convSet = new Set(args.conversationIds);
      filtered = filtered.filter((m) => convSet.has(m.conversationId as string));
    }
    if (args.participantIds?.length) {
      const partSet = new Set(args.participantIds);
      filtered = filtered.filter((m) => partSet.has(m.participantId as string));
    }

    filtered.sort((a, b) => a.timestamp - b.timestamp);

    return filtered.map((m) => ({
      _id: m._id as string,
      senderName: m.senderName,
      content: m.content,
      timestamp: m.timestamp,
      dateKey: m.dateKey,
      conversationId: m.conversationId as string,
    }));
  },
});
```

#### d. `retrieveByVector` (internal action)

Embeds query, runs vector search, expands ±5 messages around hits.

```typescript
export const retrieveByVector = internalAction({
  args: {
    query: v.string(),
    userId: v.string(),
    conversationIds: v.optional(v.array(v.string())),
    participantIds: v.optional(v.array(v.string())),
    dateRangeStart: v.optional(v.number()),
    dateRangeEnd: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ?? 40;

    // Step 1: Embed query
    const queryEmbedding = await generateQueryEmbedding(args.query);

    // Step 2: Vector search
    const vectorResults = await ctx.vectorSearch("messages", "by_embedding", {
      vector: queryEmbedding,
      limit: Math.min(256, maxResults * 4),
      filter: (q) => q.eq("userId", args.userId as Id<"users">),
    });

    if (vectorResults.length === 0) return [];

    // Step 3: Fetch full documents
    const messageIds = vectorResults.map((r) => r._id as string);
    const messages = await ctx.runQuery(internal.search.getMessagesByIds, { messageIds });

    // Step 4: Post-filter by scope
    let filtered = messages as any[];
    if (args.conversationIds?.length) {
      const convSet = new Set(args.conversationIds);
      filtered = filtered.filter((m: any) => convSet.has(m.conversationId));
    }
    if (args.participantIds?.length) {
      const partSet = new Set(args.participantIds);
      filtered = filtered.filter((m: any) => partSet.has(m.participantId));
    }
    if (args.dateRangeStart) {
      filtered = filtered.filter((m: any) => m.timestamp >= args.dateRangeStart!);
    }
    if (args.dateRangeEnd) {
      filtered = filtered.filter((m: any) => m.timestamp <= args.dateRangeEnd!);
    }

    // Step 5: Take top results and expand context ±5 messages
    const topHits = filtered.slice(0, maxResults);
    const expandedMessages = new Map<string, any>();

    for (const hit of topHits) {
      expandedMessages.set(hit._id, hit);

      // Expand context: ±5 messages around each hit
      const context = await ctx.runQuery(internal.search.getSurroundingMessages, {
        conversationId: hit.conversationId,
        timestamp: hit.timestamp,
        messageId: hit._id,
        beforeCount: 5,
        afterCount: 5,
      });

      for (const ctxMsg of [...context.before, ...context.after]) {
        if (!expandedMessages.has(ctxMsg._id)) {
          expandedMessages.set(ctxMsg._id, {
            _id: ctxMsg._id,
            senderName: ctxMsg.senderName,
            content: ctxMsg.content,
            timestamp: ctxMsg.timestamp,
            conversationId: hit.conversationId,
            dateKey: new Date(ctxMsg.timestamp).toISOString().split("T")[0],
          });
        }
      }
    }

    // Step 6: Sort chronologically and deduplicate
    const result = Array.from(expandedMessages.values());
    result.sort((a: any, b: any) => a.timestamp - b.timestamp);

    return result.map((m: any) => ({
      _id: m._id as string,
      senderName: m.senderName as string,
      content: m.content as string,
      timestamp: m.timestamp as number,
      dateKey: m.dateKey as string,
      conversationId: m.conversationId as string,
    }));
  },
});
```

#### e. `assembleContext` (internal action)

Orchestrates the full retrieval pipeline: classify → retrieve → format → budget.

```typescript
export const assembleContext = internalAction({
  args: {
    userQuery: v.string(),
    sessionId: v.id("chatSessions"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get session for scope
    const session = await ctx.runQuery(internal.chat.getSession, {
      sessionId: args.sessionId,
    });
    if (!session) throw new Error("Session not found");

    const scope = session.contextScope;
    const conversationIds = scope?.conversationIds?.map(String);
    const participantIds = scope?.participantIds?.map(String);
    const dateRange = scope?.dateRange;

    // Step 1: Classify query
    const strategy = await ctx.runAction(internal.chat.classifyQuery, {
      query: args.userQuery,
    });

    // Step 2: Retrieve based on strategy
    let retrievedMessages: any[] = [];
    const retrievedMessageIds: string[] = [];

    if (strategy === "date_load" || strategy === "hybrid") {
      // Extract dates from query
      const dateInfo = await ctx.runAction(internal.chat.extractDates, {
        query: args.userQuery,
      });

      const dateKeys: string[] = [...(dateInfo.dates || [])];

      // If range, generate all date keys in range
      if (dateInfo.range) {
        const start = new Date(dateInfo.range.start);
        const end = new Date(dateInfo.range.end);
        const current = new Date(start);
        while (current <= end) {
          dateKeys.push(current.toISOString().split("T")[0]!);
          current.setDate(current.getDate() + 1);
        }
      }

      if (dateKeys.length > 0) {
        const dateMessages = await ctx.runQuery(internal.chat.retrieveByDate, {
          userId: args.userId,
          dateKeys,
          conversationIds,
          participantIds,
        });
        retrievedMessages.push(...dateMessages);
      }
    }

    if (strategy === "vector" || strategy === "hybrid") {
      const vectorMessages = await ctx.runAction(internal.chat.retrieveByVector, {
        query: args.userQuery,
        userId: args.userId,
        conversationIds,
        participantIds,
        dateRangeStart: dateRange?.start,
        dateRangeEnd: dateRange?.end,
        limit: 40,
      });
      retrievedMessages.push(...vectorMessages);
    }

    // Step 3: Deduplicate
    const seen = new Set<string>();
    retrievedMessages = retrievedMessages.filter((m) => {
      if (seen.has(m._id)) return false;
      seen.add(m._id);
      return true;
    });

    // Collect IDs for source attribution
    for (const m of retrievedMessages) {
      retrievedMessageIds.push(m._id);
    }

    // Step 4: Resolve conversation titles for context
    const convIds = [...new Set(retrievedMessages.map((m) => m.conversationId))];
    const convTitles = new Map<string, string>();
    for (const convId of convIds) {
      const conv = await ctx.runQuery(internal.chat.getConversation, {
        conversationId: convId,
      });
      if (conv) convTitles.set(convId, conv.title);
    }

    const messagesWithTitles = retrievedMessages.map((m) => ({
      ...m,
      conversationTitle: convTitles.get(m.conversationId),
    }));

    // Step 5: Apply token budget
    const budget = calculateTokenBudget(
      session.model as ModelId,
      session.thinkingEnabled
    );

    const truncated = truncateRetrievedMessages(messagesWithTitles, budget.retrievedContext);
    const formattedContext = formatRetrievedContext(truncated);

    // Get chat history for the session
    const chatHistory = await ctx.runQuery(internal.chat.getChatHistory, {
      sessionId: args.sessionId,
    });

    const truncatedHistory = truncateChatHistory(
      chatHistory.map((m) => ({ role: m.role, content: m.content })),
      budget.chatHistory
    );

    return {
      systemPrompt: SYSTEM_PROMPT,
      formattedContext,
      chatHistory: truncatedHistory,
      retrievedMessageIds: truncated.map((m) => m._id),
      strategy,
      tokenBudget: budget,
    };
  },
});
```

#### f. Helper internal queries

```typescript
/** Internal query to get session data without auth (used by internal actions). */
export const getSession = internalQuery({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

/** Internal query to get conversation title by ID. */
export const getConversation = internalQuery({
  args: { conversationId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId as Id<"conversations">);
  },
});

/** Internal query to get chat history for a session. */
export const getChatHistory = internalQuery({
  args: { sessionId: v.id("chatSessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});
```

**Why:** Separating retrieval strategies into individual functions makes them independently testable and allows the `assembleContext` orchestrator to combine them cleanly.

**Edge cases:**
- Date range queries spanning months could generate many date keys — the message count is bounded by what actually exists in the database
- Vector search returns max 256 results — the ±5 expansion could create up to 256 * 11 = 2,816 messages, but deduplication and token budget truncation will limit this
- If Haiku classification fails, fallback to "hybrid" strategy
- Date extraction JSON parsing is wrapped in try/catch with fallback

**Verify:** Call `assembleContext` from the Convex dashboard with a test query and session ID. Verify it returns formatted context with the correct structure.

---

### Step 3: Add Date Range Retrieval Support

**File:** Updates to `/Users/robert.sawyer/Git/messagevault/convex/chat.ts`

**Changes:** Extend `retrieveByDate` to handle date ranges efficiently. For large ranges (> 31 days), limit to scanning at most 31 days and prioritize the most message-dense days.

**Key implementation details:**

- If the date range spans more than 31 days, query `dailyStats` to find the most active days within the range and load those preferentially
- This prevents loading tens of thousands of messages for queries like "What happened last year?"
- Add a `retrieveByDateRange` internal query that:
  1. Queries `dailyStats` by `userId` for the date range
  2. Sorts by `totalMessages` descending
  3. Takes top 10 most active days
  4. Loads messages for those days

**Verify:** Query about a month-long range returns messages from the busiest days, not an overwhelming number.

## 4. Testing Strategy

### Manual Testing via Convex Dashboard

1. **Query classification:** Call `classifyQuery` with test queries:
   - "What did we talk about on Christmas 2023?" → should return `date_load`
   - "Find conversations about vacation" → should return `vector`
   - "What did Mom say about the dog in 2024?" → should return `hybrid`

2. **Date extraction:** Call `extractDates` with date-specific queries:
   - "Christmas 2023" → `{"dates": ["2023-12-25"], "range": null}`
   - "last July" → appropriate range

3. **Date retrieval:** Call `retrieveByDate` with known date keys from imported data

4. **Vector retrieval:** Call `retrieveByVector` with topical queries, verify context expansion

5. **Full pipeline:** Call `assembleContext` with various query types, verify:
   - Correct strategy selected
   - Messages retrieved and formatted
   - Token budget respected
   - Chat history included

### Type Checking

```bash
pnpm build  # After stopping dev server
```

## 5. Validation Checklist

- [ ] `convex/lib/rag.ts` created with all utility functions
- [ ] `convex/chat.ts` created with classifyQuery, extractDates, retrieveByDate, retrieveByVector, assembleContext
- [ ] Query classification correctly identifies date_load, vector, and hybrid queries
- [ ] Date extraction parses specific dates and date ranges
- [ ] Date retrieval loads all messages for specified dates
- [ ] Vector retrieval returns top-40 results with ±5 context expansion
- [ ] Hybrid retrieval merges both strategies with deduplication
- [ ] Context window management respects token budgets
- [ ] Retrieved messages are formatted with sender, date, and conversation context
- [ ] System prompt is warm and appropriate for family archive
- [ ] Chat history is truncated to fit budget, keeping most recent messages
- [ ] No TypeScript errors
- [ ] All files have ABOUTME comments

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|---|---|---|
| Haiku classification returns unexpected values | Response isn't one of the three strategies | Fallback to "hybrid" for any unrecognized response |
| Date extraction returns invalid JSON | Parse error | try/catch with fallback to empty dates |
| Vector search returns 0 results | No embeddings generated yet | Check embedding count, return helpful "no results" message |
| Context exceeds token budget | Formatted text too long | `truncateRetrievedMessages` cuts at budget boundary |
| ±5 context expansion produces duplicates | Same message in multiple hit neighborhoods | Deduplication via `Map` keyed by message ID |
| Anthropic API key missing | Runtime error | Clear error message: "ANTHROPIC_API_KEY not set" |
| Voyage API key missing | Embedding fails | Error propagated from `generateQueryEmbedding` |
| Large date range (full year) | Too many messages loaded | Limit to top 10 most active days via dailyStats |

## 7. Assumptions & Dependencies

- **F1 (Chat Session Management)** is complete — `chatSessions` table has data, session scope is accessible
- **Embeddings exist** — the vector search requires messages to have embeddings (from B5)
- **ANTHROPIC_API_KEY** is set in Convex environment variables
- **VOYAGE_API_KEY** is set in Convex environment variables
- **`search.ts` internal queries** (`getMessagesByIds`, `getSurroundingMessages`, `resolveUserId`) are available and working
- **Token estimation** uses the 4-chars-per-token approximation — this is intentionally conservative; exact tokenization would require a tokenizer library that adds complexity without proportional benefit
- **Haiku 4.5** is used for query classification — fast and cheap ($0.25/MTok input)
- **Convex `internalAction`** is used for functions that call external APIs (Anthropic, Voyage) — these cannot be `query` or `mutation` types
