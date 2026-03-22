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
export const CHAT_HISTORY_RATIO = 0.1;

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

export interface RetrievedMessage {
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
