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

export interface MessageForEmbedding {
  id: string;
  senderName: string;
  content: string;
  dateKey: string;
}

/**
 * Build contextual embedding text: "[Sender] on [Date]:\n[prev]\n[current]\n[next]"
 */
export function buildContextualText(
  current: MessageForEmbedding,
  prev: MessageForEmbedding | null,
  next: MessageForEmbedding | null
): string {
  const parts: string[] = [];
  parts.push(`${current.senderName} on ${current.dateKey}:`);
  if (prev) parts.push(prev.content);
  parts.push(current.content);
  if (next) parts.push(next.content);
  return parts.join("\n");
}

/**
 * Generate embeddings for a batch of texts using Voyage-3-lite (1024 dims).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const voyageClient = getClient();
  const result = await voyageClient.embed({
    input: texts,
    model: "voyage-3-lite",
    inputType: "document",
  });
  if (!result.data) throw new Error("Voyage API returned no data");
  return result.data.map((item) => {
    if (!item.embedding) throw new Error("Missing embedding in response");
    return item.embedding;
  });
}

/**
 * Generate a single query embedding (uses "query" input type for asymmetric search).
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
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
