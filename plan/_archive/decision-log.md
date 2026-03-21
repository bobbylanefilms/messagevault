# MessageVault — Decision Log

## D1. Storage Granularity: Per-Message
**Date:** March 21, 2026 | **Conversation:** 1 | **Question:** Q1
**Status:** Decided

**Decision:** Store every individual message as its own database document.

**Rationale:** Per-message storage enables precise participant and date filtering, high-quality semantic search (embedding individual messages rather than day-sized chunks), accurate calendar heatmap counts, and fine-grained AI chat context retrieval. The scale (~15K messages per conversation, 750K total) is well within Convex's capabilities.

**Alternative considered:** Day-chunked storage (group messages by day). Rejected because it sacrifices filtering precision and embedding quality for minimal storage savings.

---

## D2. Identity Mapping: User-Prompted During Import
**Date:** March 21, 2026 | **Conversation:** 1 | **Question:** Q2
**Status:** Decided

**Decision:** During file import, prompt the user to specify who "Me" is and deduplicate against existing participants.

**Rationale:** "Me" represents whoever exported the messages (Lisa in the example file). Since multiple family members may import their own exports, the identity behind "Me" varies. Prompting during import keeps the pipeline simple and accurate.

**Alternative considered:** Hardcode "Me" = Lisa. Rejected because Rob might also export conversations, and the system should handle both.

---

## D3. Attachments: Text-Only for V1
**Date:** March 21, 2026 | **Conversation:** 1 | **Question:** Q3
**Status:** Decided

**Decision:** Store text content and metadata only. Note that attachments exist (via `messageType` and `attachmentRef` fields) but don't import binary files.

**Rationale:** Keeps v1 scope manageable. The data model already has `messageType` and `attachmentRef` fields ready for future attachment support. Adding image/video storage later won't require schema changes.

---

## D4. API Key Management: App-Level
**Date:** March 21, 2026 | **Conversation:** 1 | **Question:** Q4
**Status:** Decided

**Decision:** Single Anthropic API key stored in environment variables, shared across all users.

**Rationale:** This is a family app with 2-3 users, not a multi-tenant product. Per-user key management adds unnecessary complexity.

---

## D5. App Name: MessageVault
**Date:** March 21, 2026 | **Conversation:** 1
**Status:** Decided

**Decision:** Name the app "MessageVault."

**Rationale:** Emphasizes the archival and retrieval nature of the app. Clear and memorable.

---

## D6. AI Retrieval Strategy: Hybrid RAG
**Date:** March 21, 2026 | **Conversation:** 1
**Status:** Decided

**Decision:** Use a hybrid approach: vector search for topical/semantic queries, full-day message loading for date-specific queries, combined retrieval for hybrid queries. Query classification via a fast Haiku call determines the strategy per query.

**Rationale:** Pure RAG misses messages when a user asks about a specific date (vector search may not surface all messages from that day). Pure full-context loading doesn't scale to years of messages. The hybrid approach adapts retrieval to query type for optimal results.

**Alternative considered:** Pure RAG (vector search only). Rejected because date-specific queries would have incomplete context.

---

## D7. Embedding Model: Voyage-3-Lite
**Date:** March 21, 2026 | **Conversation:** 1
**Status:** Decided

**Decision:** Use Voyage AI's `voyage-3-lite` model for embeddings (1024 dimensions, cosine similarity).

**Rationale:** Cost-effective (~$0.02/1M tokens, translating to ~$0.74 for a 15K-message conversation), good retrieval quality, and 1024-dimension vectors are supported by Convex's vector index. Short messages get meaningful embeddings via a 3-message contextual window (previous + current + next message concatenated).

---

## D8. Calendar Performance: Pre-Aggregated Daily Stats
**Date:** March 21, 2026 | **Conversation:** 1
**Status:** Decided

**Decision:** Pre-aggregate per-day message counts into a `dailyStats` table during import, with breakdowns by conversation and participant.

**Rationale:** Calendar heatmap rendering requires message counts for every day in a year. Scanning the messages table for each day would be O(n) on total messages. Pre-aggregated stats make it O(365) per year regardless of archive size. Stats are computed once during import and upserted when new conversations are imported.

---

## D9. Reactions Storage: Separate Table
**Date:** March 21, 2026 | **Conversation:** 1
**Status:** Decided

**Decision:** Store reactions in a dedicated `reactions` table, linked to source messages by matching quoted text against message content.

**Rationale:** Reactions in the export format appear as separate messages ("👍 Liked: 'quoted text'"). Storing them as separate records with a resolved `messageId` link keeps the data model clean and allows displaying reaction chips on the correct message bubble. The `hasReactions` flag on messages enables efficient rendering without joining on every message.

---

## D10. Project Structure: Full App-Dev Workflow
**Date:** March 21, 2026 | **Conversation:** 1
**Status:** Decided

**Decision:** Set up MessageVault as a full app-dev project with the complete document suite (app-specification, conversation-log, decision-log, open-questions, question-archive).

**Rationale:** More structured approach enables iterative refinement before handoff to implementation planning. Follows Rob's established workflow.
