# MessageVault — App Specification

**Version:** 1.0 (Final)
**Date:** March 21, 2026
**Status:** Ready for Implementation Planning

---

## Executive Summary

Years of family text message history — exported as sprawling Apple Messages markdown files spanning 51,000+ lines and 700,000+ characters — are effectively inaccessible. They're too large to read linearly, impossible to search semantically, and exceed AI context windows when fed in whole. The raw exports preserve the data but destroy the experience: there's no way to find that one conversation from two Christmases ago, no way to browse a specific day's exchanges, and no way to ask "what did we talk about when Mom visited in June?"

MessageVault solves this by transforming raw message exports into a structured, searchable, AI-powered archive. It parses the markdown into individual messages with full metadata, stores them in a reactive database with semantic embeddings, and presents them through an iMessage-style browsing interface, a GitHub-inspired calendar heatmap, hybrid keyword-and-semantic search, and a RAG-powered AI chat that can answer natural language questions about years of conversations. The architecture is designed for scale — handling 750,000+ messages across 50+ conversations — while remaining fast enough that browsing a 15,000-message thread feels instantaneous.

The target audience is Rob's family: 2-3 users who share a Convex backend and Anthropic API key. This is not a public product. It's a personal tool built to professional standards, with Clerk authentication ensuring each user sees only their own imported data. While v1 focuses exclusively on Apple Messages exports, the data model and parser architecture are designed to accommodate future content types — email, Instagram DMs, and other messaging platforms — without major restructuring.

---

## Overview

MessageVault is a family-use web application for importing, browsing, searching, and chatting with archived text message exports. It transforms raw Apple Messages markdown exports into a structured, searchable, AI-powered archive.

**Target Users:** Rob's family (2-3 users). Not a public product.

**Core Problem:** Years of text message history exported as massive markdown files (51K+ lines, 700K+ characters) are unwieldy to read, impossible to search semantically, and exceed AI context windows when fed directly. MessageVault makes this archive browsable, searchable, and conversational.

**Future Scope:** While v1 targets Apple Messages exports, the architecture accommodates future content types (email, Instagram DMs, etc.) without major restructuring.

---

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| Next.js | 16.1+ | Frontend framework (App Router, Turbopack, React Compiler) |
| React | 19.2+ | UI library |
| Convex | 1.32+ | Reactive backend (database, real-time, scheduling, native vector search) |
| Clerk (`@clerk/nextjs`) | 7.x | Authentication (pre-built components, Convex integration) |
| Tailwind CSS | 4.2+ | Styling (CSS-first `@theme` config) |
| shadcn/ui | Latest | Component library (unified radix-ui package) |
| Zustand | 5.x | Local UI state (input, modals, streaming buffer) |
| TypeScript | 5.7+ | Type safety (strict mode) |
| Anthropic SDK | Latest | AI chat (Opus 4.6, Sonnet 4.6, Haiku 4.5) |
| Voyage AI | voyage-3-lite | Embedding generation (1024 dimensions) |
| `@tanstack/react-virtual` | Latest | Virtualized scrolling for large message lists |
| `@convex-dev/persistent-text-streaming` | Latest | Streaming AI responses through Convex |

**Deployment:** Vercel (frontend) + Convex Cloud (backend)

### Code Standards

- Every source file begins with a two-line comment explaining the file's purpose, each line prefixed with `ABOUTME:` for grepability. Example:
  ```typescript
  // ABOUTME: Parses Apple Messages markdown exports into structured message records.
  // ABOUTME: Handles day headers, timestamps, reactions, attachments, and multi-line content.
  ```
- TypeScript strict mode throughout. Run `npm run build` (or type-check equivalent) after changes to verify no errors before committing.
- Names describe what code does — avoid implementation details, temporal context, or unnecessary pattern suffixes in identifiers.

---

## Features

### F1. Import Conversations

Import Apple Messages markdown export files into the structured database.

**Capabilities:**
- Drag-and-drop or file picker for `.md` / `.txt` files
- Client-side header scanning to extract participant names before upload
- Identity resolution UI: user maps "Me" to their real name, deduplicates participants against existing records
- Batched server-side parsing (handles files with 50K+ lines within Convex action timeouts)
- Background embedding generation (browsing available immediately after parsing)
- Import progress tracking with real-time status updates
- Import history showing past imports with stats

**Parser Support:**
- Day section headers (`## January 1, 2023`)
- Timestamped messages (`12:03 AM - **Rob Sawyer**`)
- Blockquoted content (`> message text`)
- Reactions: `👍 Liked`, `❤️ Loved`, `😂 Laughed at`, `👎 Disliked`
- Image references: `![Image: filename](attachments/N_filename)`
- Video references: `[Video: filename](attachments/N_filename)`
- Link messages with plugin attachments
- Missing attachment markers: `*[Attachment not found: filename]*`
- Multi-line messages (consecutive blockquote lines)

**Design Consideration — Parser Format Variants (to be resolved during implementation):** The parser is built against the documented Apple Messages export format. Additional export tools may produce structural variations (different date formats, header styles, etc.). The recommended approach is to start with the documented format and build a lenient parser that gracefully handles common variations, adding explicit format detection if additional distinct formats are encountered during testing with real files. Sample files should be validated early in implementation to surface any format discrepancies.

**Design Consideration — Participant Merge UX (to be resolved during implementation):** When the same person appears with different names across imports (e.g., "Mom" in one chat, "Lisa" in another), the system needs a deduplication strategy. The recommended approach is to prompt during import ("Is [new name] the same person as [existing name]?") and also provide a merge tool in Settings for retroactive cleanup. The exact interaction flow — modal vs. inline, suggestion confidence thresholds — should be determined during UI implementation.

### F2. Browse Conversations

View imported conversations in a familiar iMessage-style thread interface.

**Capabilities:**
- Conversation list in sidebar showing all imports with participant names, message counts, date ranges
- iMessage-style message bubbles: right-aligned blue (me), left-aligned gray (others)
- Compact spacing for consecutive messages from same sender within 2 minutes
- Day divider headers between date boundaries
- Reaction emoji chips displayed below reacted-to messages
- Attachment type indicators (image icon, video icon, missing attachment warning)
- Participant color coding in group chats
- Timestamps shown on hover (not permanently displayed)
- Date jumper to navigate to a specific day within a conversation
- Participant filter in group chats
- Virtualized scrolling via `@tanstack/react-virtual` for 14K+ message threads

**Design Consideration — Group Chat Handling (to be resolved during implementation):** Group chats (3+ participants) are supported in the data model via the `isGroupChat` flag and `participantIds` array. The baseline treatment is identical to 1:1 chats with sender names displayed on every message and color-coded per participant. Group-specific features such as participant activity breakdowns within a conversation and sub-thread filtering between specific participants within the group may be added if group chat exports exist and testing reveals the need. This should be evaluated once real group chat data is available.

### F3. Calendar Heatmap

GitHub-contribution-style visualization of message activity over time.

**Capabilities:**
- 52-column × 7-row grid showing one year of activity
- 5-level color intensity based on daily message count (0, 1-5, 6-20, 21-50, 51+)
- Year selector to switch between years
- Conversation filter — show activity for a specific conversation or all
- Participant filter — show only messages involving specific people
- Hover tooltips showing date, message count, active participants
- Click to drill down into a specific day's messages
- Month labels along top, day-of-week labels along left
- Color legend

**Calendar Day Detail View:**
- All messages from the selected day across all conversations (or filtered)
- Messages grouped by conversation with conversation banners
- Previous/next day navigation arrows
- Message count header

### F4. Search

Hybrid search combining semantic understanding, keyword matching, and metadata filtering.

**Capabilities:**
- Search input with 300ms debounce
- Search mode toggle: Keyword / Semantic / Hybrid (default: Hybrid)
- Filter bar: conversation selector, participant selector, date range picker, message type filter
- Keyword search via Convex full-text search index
- Semantic search via Convex vector search (query embedded with Voyage-3-lite)
- Results merged via Reciprocal Rank Fusion (RRF) scoring
- Results displayed as message bubbles with highlighted match terms
- Surrounding context (1-2 messages before and after each hit) included in results
- Result count and distribution stats ("Found 47 results in 12 conversations")
- Click result to navigate to message in browse view with context

### F5. AI Chat

RAG-powered conversational interface for exploring message history with Claude.

**Capabilities:**
- Chat session management (create, list, switch, delete sessions)
- Scope control — chat across all conversations or filter to specific conversations/participants/date ranges
- Model selector: Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- Extended thinking toggle with collapsible thinking display in responses
- Streaming responses via persistent-text-streaming
- Markdown rendering in AI responses (react-markdown + remark-gfm)
- Source attribution — expandable section showing which archived messages informed each response
- Suggestion cards on empty state:
  - "Summarize my conversations with [most frequent participant]"
  - "What were the major events we discussed in [year]?"
  - "Find conversations about [recent topic]"
  - "What's the funniest exchange in my messages?"
- Copy button on AI responses
- Chat history persisted in database

**RAG Pipeline:**
- Query classification (Haiku call) determines retrieval strategy:
  - **Date-specific queries** → Load all messages for that date from the index
  - **Topical/semantic queries** → Vector search top-40 results + context window expansion (±5 messages around each hit)
  - **Hybrid queries** → Both strategies merged and deduplicated
- Context window management with budget allocation:
  - System prompt: ~500 tokens
  - Chat history: last 10-15 messages (~2,000-5,000 tokens)
  - Retrieved messages: remaining budget
  - Response budget: 8,192 tokens (16,000 with thinking)
- Prioritization when context exceeds budget: highest similarity scores first, complete days over partial, recency bias
- System prompt establishes the assistant as a personal message archive explorer, with warm conversational tone appropriate for family messages

### F6. Dashboard

Overview page showing archive statistics and recent activity.

**Capabilities:**
- Stats cards: total messages, total conversations, overall date range, top participants by message count
- Recent activity: last few messages across all conversations
- Mini calendar heatmap (clickable to full view)
- Conversation list with quick navigation
- Import button
- Clerk `<UserButton />` for profile/logout

### F7. Settings

User preferences and data management.

**Capabilities:**
- Profile settings: display name, real name (used for "Me" mapping during import)
- Participant manager: view all participants across conversations, merge duplicates, edit display names, change bubble colors
- Default model and thinking level preferences
- Data management: delete conversations, view storage usage

**Design Consideration — Message Analytics (to be resolved during implementation):** Beyond the calendar heatmap and basic stats cards on the dashboard, additional analytics features (word frequency, sentiment trends, response time analysis, most active hours, emoji usage stats) could add value to archive exploration. The recommended v1 approach is to defer dedicated analytics UI — users can explore these questions through AI chat, which has access to the full archive. A basic analytics page with computed stats (messages per month trend line, top emoji, most active hour) could be considered as a post-v1 enhancement if demand emerges.

**Design Consideration — Export / Backup (to be resolved during implementation):** Users may want to export specific conversations or date ranges as formatted markdown or PDF, or back up structured data. This is a purely additive feature with no architectural dependencies and is deferred from v1 scope. The data model supports export without modification — it's purely a UI and rendering concern when the time comes.

---

## Data Model

### Table: `users`

Application user records, synced from Clerk on first login.

| Field | Type | Notes |
|---|---|---|
| `clerkId` | `v.string()` | Clerk user ID |
| `displayName` | `v.string()` | Display name |
| `avatarUrl` | `v.optional(v.string())` | Profile image URL |
| `realName` | `v.string()` | Canonical name for "Me" identity mapping |
| `preferences` | `v.object({ defaultModel: v.string(), thinkingEnabled: v.boolean(), theme: v.string() })` | App preferences |

**Indexes:** `by_clerkId` on `clerkId`

### Table: `conversations`

Each imported markdown file becomes a conversation record.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | Owner who imported |
| `title` | `v.string()` | From file header, e.g., "Messages with Rob Sawyer" |
| `isGroupChat` | `v.boolean()` | True if 3+ participants |
| `participantIds` | `v.array(v.id("participants"))` | All participants |
| `dateRange` | `v.object({ start: v.number(), end: v.number() })` | Epoch ms of earliest/latest message |
| `messageCount` | `v.number()` | Denormalized total |
| `importedAt` | `v.number()` | When file was imported |
| `sourceFilename` | `v.string()` | Original filename |
| `metadata` | `v.optional(v.object({ contactInfo: v.optional(v.string()), exportedAt: v.optional(v.string()), totalMessagesReported: v.optional(v.number()) }))` | Extracted header metadata |

**Indexes:** `by_userId` on `userId`, `by_userId_importedAt` on `[userId, importedAt]`

### Table: `participants`

Canonical people across all conversations. Supports cross-conversation identity deduplication.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | Owner |
| `displayName` | `v.string()` | Canonical name (e.g., "Rob Sawyer") |
| `aliases` | `v.array(v.string())` | Alternative names seen across imports |
| `isMe` | `v.boolean()` | True if this represents the importing user |
| `avatarColor` | `v.string()` | Assigned bubble color from palette |
| `conversationCount` | `v.number()` | Denormalized: how many conversations they appear in |
| `messageCount` | `v.number()` | Denormalized: total messages across all conversations |

**Indexes:** `by_userId` on `userId`, `by_userId_displayName` on `[userId, displayName]`
**Search Index:** `search_name` on `displayName` with `filterFields: ["userId"]`

### Table: `messages`

Individual parsed messages. The core data table. Each message is stored as its own document (Decision D1) to enable precise filtering, high-quality semantic search at the message level, and fine-grained AI context retrieval.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | Denormalized for auth filtering |
| `conversationId` | `v.id("conversations")` | Parent conversation |
| `participantId` | `v.id("participants")` | Sender |
| `senderName` | `v.string()` | Denormalized sender name for display |
| `timestamp` | `v.number()` | Epoch ms — full datetime |
| `dateKey` | `v.string()` | ISO date "2023-01-15" for calendar/day queries |
| `content` | `v.string()` | Plain text content (markdown formatting stripped) |
| `rawContent` | `v.optional(v.string())` | Original markdown if different from plain text |
| `messageType` | `v.union(v.literal("text"), v.literal("image"), v.literal("video"), v.literal("link"), v.literal("attachment_missing"))` | Content type |
| `attachmentRef` | `v.optional(v.string())` | Original attachment filename if applicable |
| `hasReactions` | `v.boolean()` | Whether any reactions reference this message |
| `embedding` | `v.optional(v.array(v.float64()))` | 1024-dimension semantic vector |

**Indexes:**
- `by_conversationId_timestamp` on `[conversationId, timestamp]` — primary browsing query
- `by_userId_dateKey` on `[userId, dateKey]` — cross-conversation day queries
- `by_conversationId_dateKey` on `[conversationId, dateKey]` — per-conversation day queries
- `by_participantId` on `participantId` — participant filtering

**Search Index:** `search_content` on `content` with `filterFields: ["userId", "conversationId", "participantId"]`

**Vector Index:** `by_embedding` on `embedding`, 1024 dimensions, cosine similarity, `filterFields: ["userId", "conversationId"]`

### Table: `reactions`

Reactions stored separately (Decision D9), linked to messages by quoted text matching.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | Owner |
| `conversationId` | `v.id("conversations")` | |
| `messageId` | `v.optional(v.id("messages"))` | Resolved link to reacted-to message (null if unmatched) |
| `participantId` | `v.id("participants")` | Who reacted |
| `reactionType` | `v.union(v.literal("liked"), v.literal("loved"), v.literal("laughed"), v.literal("disliked"), v.literal("emphasized"), v.literal("questioned"))` | Reaction emoji type |
| `quotedText` | `v.string()` | Quoted text from the reaction message |
| `timestamp` | `v.number()` | When the reaction appeared |

**Indexes:** `by_messageId` on `messageId`, `by_conversationId` on `conversationId`

### Table: `dailyStats`

Pre-aggregated per-day statistics for the calendar heatmap (Decision D8). Computed during import to make calendar rendering O(365) per year instead of scanning the entire messages table.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | Owner |
| `dateKey` | `v.string()` | ISO date "2023-01-15" |
| `totalMessages` | `v.number()` | Messages across all conversations this day |
| `conversationBreakdown` | `v.array(v.object({ conversationId: v.id("conversations"), count: v.number() }))` | Per-conversation counts |
| `participantBreakdown` | `v.array(v.object({ participantId: v.id("participants"), count: v.number() }))` | Per-participant counts |

**Indexes:** `by_userId_dateKey` on `[userId, dateKey]`

### Table: `chatSessions`

AI chat sessions.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | Owner |
| `title` | `v.optional(v.string())` | Auto-generated or user-set |
| `model` | `v.string()` | Claude model ID |
| `thinkingEnabled` | `v.boolean()` | Extended thinking toggle |
| `messageCount` | `v.number()` | Denormalized |
| `lastActivityAt` | `v.number()` | For sorting |
| `contextScope` | `v.optional(v.object({ conversationIds: v.optional(v.array(v.id("conversations"))), participantIds: v.optional(v.array(v.id("participants"))), dateRange: v.optional(v.object({ start: v.number(), end: v.number() })) }))` | Optional filter scope |

**Indexes:** `by_userId` on `userId`, `by_userId_lastActivity` on `[userId, lastActivityAt]`

### Table: `chatMessages`

Messages within AI chat sessions. Separate from imported messages.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | `v.id("chatSessions")` | Parent session |
| `userId` | `v.id("users")` | Denormalized for auth |
| `role` | `v.union(v.literal("user"), v.literal("assistant"), v.literal("system"))` | |
| `content` | `v.string()` | Message text |
| `thinkingContent` | `v.optional(v.string())` | Extended thinking output |
| `model` | `v.optional(v.string())` | Which model generated this |
| `inputTokens` | `v.optional(v.number())` | |
| `outputTokens` | `v.optional(v.number())` | |
| `retrievedMessageIds` | `v.optional(v.array(v.id("messages")))` | Archived messages used as context |
| `retrievalStrategy` | `v.optional(v.string())` | "vector" / "date_load" / "hybrid" |
| `streamId` | `v.optional(v.string())` | For persistent-text-streaming |

**Indexes:** `by_sessionId` on `sessionId`

### Table: `importJobs`

Import progress tracking.

| Field | Type | Notes |
|---|---|---|
| `userId` | `v.id("users")` | |
| `status` | `v.union(v.literal("uploading"), v.literal("parsing"), v.literal("embedding"), v.literal("completed"), v.literal("failed"))` | Pipeline stage |
| `conversationId` | `v.optional(v.id("conversations"))` | Created after header parsing |
| `sourceFilename` | `v.string()` | |
| `totalLines` | `v.optional(v.number())` | |
| `parsedMessages` | `v.number()` | Parsing progress |
| `embeddedMessages` | `v.number()` | Embedding progress |
| `totalMessages` | `v.number()` | Total after parsing |
| `error` | `v.optional(v.string())` | Error message if failed |
| `startedAt` | `v.number()` | |
| `completedAt` | `v.optional(v.number())` | |

**Indexes:** `by_userId` on `userId`, `by_status` on `status`

---

## Technical Architecture

### Authentication

Clerk handles all auth UI, tokens, and session management. `ConvexProviderWithClerk` wraps the app in the root layout. Every user-facing Convex query/mutation starts with a `getUserId(ctx)` helper that verifies Clerk identity and returns the user's Convex ID. User records are created just-in-time on first Convex operation (not via webhook).

### Import Pipeline

The pipeline processes large files (51K+ lines) within Convex's 10-minute action timeout using batched scheduling:

1. **Client upload** — File read as text via `FileReader`, content sent to Convex mutation
2. **Identity resolution** — Client-side pre-scan extracts participant names; UI prompts user to map "Me" (Decision D2) and deduplicate against existing participants
3. **Header parsing** — Convex action parses the `# Messages with [Name]` header, creates conversation and participant records
4. **Message parsing** — Batched in ~2,000 messages per action invocation. Each batch writes via `ctx.runMutation`, then schedules the next batch via `ctx.scheduler.runAfter(0, ...)`. State machine parser handles day headers, timestamps, participant detection, content extraction, reaction parsing, attachment detection.
5. **Reaction resolution** — After all messages are parsed, a pass matches reaction `quotedText` against recent messages to resolve `messageId` links (Decision D9)
6. **Daily stats aggregation** — Aggregate message counts by date, upsert `dailyStats` records (Decision D8)
7. **Embedding generation** — Batched: 100 messages per Voyage API call, multiple calls per action. For short messages, embed with a 3-message contextual window (previous + current + next) to give semantic meaning to replies like "ok" or "lol". Progress tracked via `importJobs.embeddedMessages`. Rate limit handling with exponential backoff via scheduler.
8. **Completion** — Update import job status, finalize conversation metadata

Users can browse messages immediately after step 4 completes. Embeddings generate in the background (step 7) — search and AI chat become available once embedding is complete.

**Attachment handling (Decision D3):** V1 stores text content and metadata only. Attachment existence is recorded via `messageType` and `attachmentRef` fields but binary files are not imported. The schema is ready for future attachment support without modification.

### Search Architecture

Three retrieval methods run in parallel and merge results:

**Keyword Search:** Convex full-text search index on `messages.content` with filter fields for scoping by user, conversation, participant.

**Semantic Search:** User's query embedded via Voyage-3-lite, then queried against Convex vector index. Returns top-K most similar messages. Note: Convex vector search supports equality filters only (not range), so date range filtering is applied as a post-filter.

**Metadata Filters:** Direct index queries for participant, conversation, date range, message type.

**Result Merging:** Reciprocal Rank Fusion (RRF) with k=60. For each message appearing in any result set: `score = sum(1 / (60 + rank))`. Final results sorted by merged score. Each result includes 1-2 surrounding messages for context.

### AI Chat RAG Pipeline

The retrieval strategy adapts to query type via a hybrid approach (Decision D6), using query classification to determine the optimal retrieval method per query.

**Step 1 — Query Classification:** A fast Haiku call classifies the user's query into a retrieval strategy:
- `date_load`: Load all messages for a specific date/range
- `vector`: Semantic search for topical queries
- `hybrid`: Both strategies combined

**Step 2 — Context Assembly:**
- Date-load: Query `by_conversationId_dateKey` or `by_userId_dateKey` index, format chronologically
- Vector: Embed query → vector search (top 40) → expand ±5 messages around each hit → deduplicate → sort chronologically → group by day
- Hybrid: Run both, merge, deduplicate

**Step 3 — Context Window Management:**
- Budget: `available = model_context - response_budget`
- Chat history: min(5000 tokens, 10% of available)
- Retrieved context: remaining budget after system prompt and chat history
- Overflow priority: highest similarity → complete days → most recent

**Step 4 — Streaming:** Create chatMessage record with streamId → Convex action calls Anthropic API with streaming → chunks written to persistent-text-stream → client subscribes reactively → finalize record on completion

### Embedding Strategy

**Model:** Voyage AI `voyage-3-lite` (1024 dimensions, cosine similarity) — Decision D7
**Cost:** ~$0.02/1M tokens. At 50 tokens average per contextual window × 15K messages = $0.015 per conversation. Negligible even at 50+ conversations.
**Contextual Window:** For each message, the embedding input is:
```
[Sender] to [Recipients] on [Date]:
[Previous message content]
[Current message content]
[Next message content]
```
This gives semantic meaning to short replies by embedding them in conversational context.

---

## Security & Privacy

### Authentication & Authorization

All access is gated through Clerk authentication. Unauthenticated requests receive no data. The `ConvexProviderWithClerk` wrapper ensures every client-side operation carries a valid session token.

Every Convex query, mutation, and action begins with a `getUserId(ctx)` call that verifies the Clerk token and resolves the authenticated user's Convex ID. Functions that skip this check do not exist — it is a mandatory first line in all user-facing backend functions.

### Data Isolation

Each user's data is fully isolated. The `userId` field is present on every table (conversations, messages, participants, reactions, dailyStats, chatSessions, chatMessages, importJobs) and is included in query filters for all operations. A user can never read, search, or retrieve another user's messages, even if they share the same Convex backend.

This isolation is enforced at the query level, not the application level. Convex indexes include `userId` as a filter field, meaning the database itself scopes results to the authenticated user. There is no admin view or cross-user access.

### API Key Management

A single Anthropic API key and a single Voyage AI API key are stored as Convex environment variables (Decision D4). These keys are never exposed to the client — all AI operations (embedding generation, chat completion, query classification) execute in Convex actions on the server side. The keys are shared across all users, which is appropriate for a family app with 2-3 trusted users.

### No External Data Sharing

Message content is never sent to external services except:
- **Voyage AI** — message text (with contextual window) is sent for embedding generation during import. This is a one-time operation per message.
- **Anthropic** — retrieved message excerpts are included in AI chat prompts as context for generating responses. This occurs only when the user actively uses the AI chat feature.

No message data is sent to analytics services, logging platforms, or any other third party. No telemetry is collected. The application does not phone home.

### Client-Side Security

File uploads are processed client-side via `FileReader` (text extraction only) before content is sent to Convex. No file content is sent to the Vercel frontend server — parsing happens entirely within Convex actions.

Clerk handles all credential storage, session management, and token rotation. The application stores no passwords or authentication secrets.

---

## UI/UX Design

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  MessageVault       [Search]     [Import]  [User]   │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  Sidebar   │              Main Content Area                  │
│            │                                                 │
│  MESSAGES  │    (Dashboard / Browse / Calendar / Search /    │
│  > Rob     │     AI Chat / Import / Settings)                │
│  > Mom     │                                                 │
│  > Family  │                                                 │
│            │                                                 │
│  ────────  │                                                 │
│  VIEWS     │                                                 │
│  Calendar  │                                                 │
│  Search    │                                                 │
│  AI Chat   │                                                 │
│            │                                                 │
│  ────────  │                                                 │
│  [Import]  │                                                 │
│  [Settings]│                                                 │
├────────────┴─────────────────────────────────────────────────┤
└──────────────────────────────────────────────────────────────┘
```

### Route Structure

| Route | View | Description |
|---|---|---|
| `/` | Landing | Clerk sign-in/sign-up |
| `/dashboard` | Dashboard | Stats overview, conversation list, mini heatmap |
| `/browse` | Browse | Redirects to most recent conversation |
| `/browse/[conversationId]` | Thread View | iMessage-style message thread |
| `/calendar` | Calendar Heatmap | GitHub-style activity grid |
| `/calendar/[dateKey]` | Day Detail | All messages from one day |
| `/search` | Search | Hybrid search interface |
| `/chat` | AI Chat | Chat session list + pane |
| `/chat/[sessionId]` | Chat Session | Specific AI conversation |
| `/import` | Import | File upload + identity mapping |
| `/settings` | Settings | Profile, participants, preferences |

### Design Principles

- **Dark mode default** with system preference detection and manual toggle
- **iMessage-inspired** message bubbles with familiar alignment and color conventions
- **GitHub-inspired** calendar heatmap with 5-level intensity
- **Clean, modern interface** — shadcn/ui components for consistent feel
- **Responsive** but desktop-primary (this is a family archive tool, not a mobile app)
- **Warm and personal** — these are family messages, so the UI should feel intimate, not clinical

### Key Interaction Patterns

**Virtualized scrolling** is mandatory for the browse view. 14K+ messages cannot be DOM-rendered. `@tanstack/react-virtual` handles this.

**Message bubble grouping:** Consecutive messages from the same sender within 2 minutes render without repeated sender name/avatar, with tighter vertical spacing. New sender or >5 minute gap triggers full bubble with name and timestamp.

**Calendar drill-down:** Click a heatmap cell → navigate to `/calendar/[dateKey]` showing all messages from that day. If multiple conversations had activity, show grouped by conversation with banners.

**Search-to-browse:** Click a search result → navigate to `/browse/[conversationId]` scrolled to that message with surrounding context visible and the target message highlighted.

**AI Chat sources:** Each AI response has an expandable "Sources" section showing the actual retrieved messages, rendered as mini message bubbles. Click a source to jump to it in the browse view.

---

## Constraints and Requirements

- **Convex action timeout:** 10 minutes. Import pipeline must batch operations using scheduler chaining.
- **Convex document size:** 1MB per document. Messages are small; no concern.
- **Convex vector search:** Supports equality filters only on filter fields (not range queries). Date range must be post-filtered.
- **Convex vector index:** Up to 256 results per query. Sufficient for RAG retrieval.
- **Embedding dimensions:** 1024 (Voyage-3-lite). Stored as `v.array(v.float64())`.
- **API key management:** Single Anthropic API key in environment variables. Single Voyage AI key. Both server-side only.
- **File format:** Must handle the Apple Messages markdown export format as documented. Parser should be extensible for future formats.
- **No attachment storage in v1:** Note attachment existence in message records but don't import binary files.

---

## Scalability

| Metric | Expected Scale | Convex Capability |
|---|---|---|
| Messages per conversation | ~15,000 | No issue |
| Total conversations | 50+ | No issue |
| Total messages | 750,000+ | Supported with proper indexes |
| Embeddings (1024-dim) | 750,000+ | HNSW index handles well |
| Embedding cost | ~$1 for 1M messages | Negligible |
| Concurrent users | 2-3 | Trivial |

**Performance optimizations:**
- Pre-aggregated `dailyStats` table: O(365) calendar queries per year
- All message queries use compound indexes
- Lazy embedding: browse available before embeddings complete
- Cursor-based pagination via Convex `.paginate()`
- 300ms debounced search input
- Cached query classifications for AI chat follow-ups

---

## Success Metrics

These metrics define what "working well" looks like for a family archive tool. They are experience-oriented, not business-oriented.

### Import Reliability
- A 51K-line, 15K-message markdown file imports successfully without errors or timeouts
- Import progress is visible and accurate throughout the pipeline
- Browsing is available within 30 seconds of starting import (before embeddings complete)
- Embedding generation for a 15K-message conversation completes within 10 minutes

### Browsing Performance
- A 15K-message conversation loads and is scrollable without jank or lag
- Scrolling through the full conversation feels smooth (consistent 60fps via virtualization)
- Date jumper navigates to any point in the conversation within 1 second
- Message bubbles render correctly: right/left alignment, grouping, reactions, day dividers

### Search Quality
- Keyword search returns exact matches with highlighted terms in under 1 second
- Semantic search returns topically relevant messages for natural language queries (e.g., "conversations about vacation plans" surfaces relevant messages even without the word "vacation")
- Hybrid search returns results in under 2 seconds
- Search results include enough surrounding context to understand the conversation flow

### AI Chat Responsiveness
- First token of AI response streams within 3 seconds of sending a query
- Date-specific queries ("What did we talk about on Christmas 2023?") retrieve all messages from that day
- Topical queries retrieve relevant messages across conversations and time periods
- Source attribution accurately links to the original messages used as context
- Follow-up questions maintain conversational context without repeating retrieval

### Calendar Heatmap Accuracy
- Heatmap renders a full year of data without visible delay
- Daily message counts match actual imported data
- Clicking a day cell shows all messages from that day, grouped by conversation
- Filtering by conversation or participant updates the heatmap correctly

### Data Integrity
- All messages from an import file are accounted for (parsed count matches expected count)
- Reactions are correctly linked to their source messages
- Participant identity is consistent across conversations after deduplication
- Data persists correctly across sessions — refreshing the browser loses no state

---

## Design Decisions Reference

The following decisions were made during design conversations and are reflected throughout this specification. See the Decision Log for full rationale and alternatives considered.

| ID | Decision | Summary |
|---|---|---|
| D1 | Per-message storage granularity | Each message is its own database document for precise filtering and embedding |
| D2 | User-prompted identity mapping | Users map "Me" during import; supports multiple family members importing |
| D3 | Text-only for v1 | Attachments noted in metadata but binary files not imported |
| D4 | App-level API keys | Single Anthropic and Voyage AI keys shared across all users |
| D5 | App name: MessageVault | Emphasizes archival and retrieval nature |
| D6 | Hybrid RAG retrieval | Query classification routes to vector search, date loading, or both |
| D7 | Voyage-3-lite embeddings | 1024 dimensions, cost-effective, contextual window for short messages |
| D8 | Pre-aggregated daily stats | O(365) calendar queries via `dailyStats` table computed at import time |
| D9 | Separate reactions table | Reactions parsed from export format, linked to messages by quoted text matching |
| D10 | Full app-dev workflow | Complete document suite for iterative design before implementation |
