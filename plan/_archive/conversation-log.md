# MessageVault — Conversation Log

## Conversation 1: Initial Design Session
**Date:** March 21, 2026
**Questions Covered:** Q1–Q4
**Topics:** Core concept, tech stack, data model, feature set, architecture

### Summary

Established the full concept and architecture for MessageVault through an interactive design session.

**Starting point:** Rob has years of Apple Messages exports as large markdown files (51K+ lines) that are unwieldy to search or analyze. Wants a family-use web app to import, browse, search, and chat with these archives.

**Key decisions made:**
1. Per-message storage (not day-chunked) for filtering precision and semantic search quality
2. "Me" identity mapped during import via user prompt (not hardcoded)
3. Text-only for v1 — note attachment existence but don't store files
4. App-level Anthropic API key (single env var, not per-user)
5. App named "MessageVault"
6. Full app-dev project workflow
7. Hybrid RAG approach: vector search for topical queries + full-day loading for date-specific queries
8. 9-table Convex data model designed (users, conversations, participants, messages, reactions, dailyStats, chatSessions, chatMessages, importJobs)

**Architecture highlights:**
- Voyage-3-lite embeddings (1024d) with 3-message contextual windows for short message disambiguation
- Batched import pipeline using Convex scheduler chaining to handle 50K+ line files
- Pre-aggregated dailyStats for O(365) calendar heatmap rendering
- Query classification via Haiku to route RAG retrieval strategy
- Persistent text streaming for AI chat responses
- Virtualized scrolling for large message threads

**Features specified:**
- F1: Import conversations (with identity resolution)
- F2: Browse conversations (iMessage-style thread view)
- F3: Calendar heatmap (GitHub-contribution style)
- F4: Hybrid search (vector + keyword + metadata)
- F5: AI chat (RAG with model/thinking selection)
- F6: Dashboard (stats overview)
- F7: Settings (profile, participant management)

**Reference files identified:**
- `app-dev/vibestormer/chat-feature-description.md` — Chat UI patterns
- `app-dev/vibestormer/implementation-plan.md` — Convex + Clerk + Next.js 16 setup
- `app-dev/vibestormer/getting-started.md` — Provider stack patterns
- `personal/TextSplit/Rob.Messages.2023-March 16 2026.M` — Real data for parser validation

### Open Items for Next Session
- Finalize import parser edge cases with additional test files
- Design the participant merge/dedup UI in detail
- Discuss whether to add message analytics (word frequency, sentiment trends)
- Consider notification preferences for import completion
