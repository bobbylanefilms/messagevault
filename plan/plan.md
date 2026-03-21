# MessageVault — Implementation Plan

**Date:** March 21, 2026
**Status:** Not Started
**Total Projects:** 30
**Total Stages:** 7
**Estimated Timeline:** 5-7 days (AI-assisted, 3-5x velocity)
**Development Model:** Solo developer (Rob) + Claude Code agent delegation
**Project Structure:** Next.js 16.1+ App Router, Convex 1.32+ backend, Clerk 7.x auth, Tailwind CSS 4.2+, shadcn/ui, deployed on Vercel + Convex Cloud

---

## Overview

| Stage | Name | Projects | Status |
|---|---|---|---|
| 1 | Foundation & Auth | A1–A5 | Not Started |
| 2 | Import Pipeline | B1–B5 | Not Started |
| 3 | Browse & Conversations | C1–C4 | Not Started |
| 4 | Calendar Visualization | D1–D3 | Not Started |
| 5 | Search | E1–E4 | Not Started |
| 6 | AI Chat | F1–F5 | Not Started |
| 7 | Dashboard & Settings | G1–G4 | Not Started |

---

## Stage 1: Foundation & Auth

**Goal:** A deployed, authenticated app shell with the full Convex schema, navigation layout, and provider stack in place. The user can sign in, see the sidebar and top bar, and navigate between empty placeholder pages.

### A1. Project Setup and Configuration

**Description:** Initialize the Next.js 16.1+ project with TypeScript strict mode, Convex, Clerk, Tailwind CSS 4.2+, shadcn/ui, and Zustand. Configure the development environment, linting, formatting, and deployment targets.

**Spec Reference:** See App Specification: Tech Stack

**Features:**
- Next.js 16.1+ project with App Router, Turbopack, and React Compiler enabled
- Convex 1.32+ initialized with development deployment
- Clerk 7.x configured with environment variables
- Tailwind CSS 4.2+ with `@theme` configuration
- shadcn/ui component library initialized
- Zustand 5.x installed
- TypeScript 5.7+ in strict mode
- All other dependencies installed (`@tanstack/react-virtual`, `@convex-dev/persistent-text-streaming`, `react-markdown`, `remark-gfm`, Anthropic SDK, Voyage AI SDK)

**Technical Decisions:**
- Tailwind CSS 4.2+ uses CSS-first `@theme` configuration (not `tailwind.config.js`)
- React Compiler enabled via Next.js 16.1+ built-in support
- Single `package.json` — no monorepo structure

**Constraints:** None — first project.

**Deliverable:** `npm run dev` starts the app, `npm run build` succeeds, Convex dev deployment is live.

---

### A2. Convex Schema and Database Setup

**Description:** Define the complete 9-table Convex schema with all indexes, search indexes, and vector indexes. This schema is the foundation every subsequent project builds on.

**Spec Reference:** See App Specification: Data Model

**Features:**
- `users` table with `by_clerkId` index
- `conversations` table with `by_userId` and `by_userId_importedAt` indexes
- `participants` table with `by_userId`, `by_userId_displayName` indexes and `search_name` search index
- `messages` table with `by_conversationId_timestamp`, `by_userId_dateKey`, `by_conversationId_dateKey`, `by_participantId` indexes, `search_content` search index, and `by_embedding` vector index (1024 dimensions, cosine)
- `reactions` table with `by_messageId` and `by_conversationId` indexes
- `dailyStats` table with `by_userId_dateKey` index
- `chatSessions` table with `by_userId` and `by_userId_lastActivity` indexes
- `chatMessages` table with `by_sessionId` index
- `importJobs` table with `by_userId` and `by_status` indexes

**Technical Decisions:**
- Embedding field is `v.optional(v.array(v.float64()))` — optional because embeddings are generated asynchronously after parsing
- `messages.dateKey` stored as ISO date string (`"2023-01-15"`) for calendar queries
- Denormalized fields (`senderName` on messages, `messageCount` on conversations/participants) are intentional — reduces joins for high-frequency queries
- Vector index uses cosine similarity with filter fields `["userId", "conversationId"]`

**Constraints:** Schema must be deployed before any data-writing projects can begin.

**Deliverable:** `npx convex dev` deploys the schema successfully. All tables, indexes, search indexes, and vector index are live.

---

### A3. Authentication and User Management

**Description:** Integrate Clerk authentication with the Convex backend. Set up the provider stack, sign-in/sign-up flow, and just-in-time user record creation in Convex.

**Spec Reference:** See App Specification: Authentication

**Features:**
- `ConvexProviderWithClerk` wrapping the app in the root layout
- Landing page (`/`) with Clerk `<SignIn />` and `<SignUp />` components
- Authenticated route protection — unauthenticated users redirected to `/`
- `getUserId(ctx)` helper function that verifies Clerk identity and returns the Convex user ID
- Just-in-time user creation: first Convex operation creates a `users` record if none exists
- Default user preferences set on creation (`defaultModel`, `thinkingEnabled`, `theme`)

**UI/UX Details:**
- Landing page is clean and minimal — app name, tagline, and Clerk auth components
- Dark mode default styling applied to auth components via Clerk theming

**Technical Decisions:**
- User records created just-in-time on first Convex operation, not via Clerk webhooks
- `getUserId(ctx)` is the single auth gate for all user-facing queries/mutations
- No role-based access — all authenticated users have equal access

**Constraints:** Requires A1 (project setup) and A2 (schema) to be complete.

**Deliverable:** User can sign up, sign in, and see the authenticated app. User record is created in Convex on first login.

---

### A4. App Shell and Layout

**Description:** Build the persistent app shell: top navigation bar with logo, search shortcut, import button, and Clerk `<UserButton />`; collapsible sidebar with conversation list placeholder, view navigation, and utility links. Implement the route structure with placeholder pages for all views.

**Spec Reference:** See App Specification: UI/UX Design — Layout, Route Structure

**Features:**
- Top bar with MessageVault logo/name, search icon (navigates to `/search`), Import button (navigates to `/import`), Clerk `<UserButton />`
- Collapsible sidebar with sections: MESSAGES (conversation list placeholder), VIEWS (Calendar, Search, AI Chat links), utility links (Import, Settings)
- All routes defined with placeholder pages: `/dashboard`, `/browse`, `/browse/[conversationId]`, `/calendar`, `/calendar/[dateKey]`, `/search`, `/chat`, `/chat/[sessionId]`, `/import`, `/settings`
- Redirect `/` to `/dashboard` for authenticated users
- Active route highlighting in sidebar

**UI/UX Details:**
- Dark mode default with system preference detection and manual toggle (via `theme` user preference)
- Desktop-primary responsive layout — sidebar collapses on narrow viewports
- shadcn/ui components for all navigation elements
- Warm, personal aesthetic — not clinical
- Layout as shown in the spec wireframe: sidebar on left, main content area on right

**Technical Decisions:**
- Next.js App Router layout groups: `(auth)` for the landing page, `(app)` for all authenticated routes
- Sidebar state managed locally (Zustand or React state) — not persisted to database

**Constraints:** Requires A3 (authentication) for Clerk `<UserButton />` and route protection.

**Deliverable:** Authenticated user can navigate between all placeholder pages via sidebar and top bar. Layout matches the wireframe structure.

---

### A5. Shared Utilities and UI Components

**Description:** Build reusable utilities and UI components shared across multiple features: date/time formatting, message type icon components, color palette for participant avatars, loading states, error boundaries, and empty state patterns.

**Spec Reference:** See App Specification: UI/UX Design — Design Principles

**Features:**
- Date/time formatting utilities (relative timestamps, day headers, ISO date key generation)
- Message type icon components (text, image, video, link, missing attachment)
- Participant color palette (10+ distinct colors for group chat differentiation)
- Loading skeleton components for conversation lists, message threads, stats cards
- Error boundary component with retry
- Empty state component with illustration placeholder and call-to-action
- Reusable page header component

**UI/UX Details:**
- Loading skeletons match the shape of the content they replace
- Empty states use warm, encouraging copy (e.g., "No conversations yet. Import your first archive to get started.")
- Error states offer a retry action and user-friendly error description

**Technical Decisions:**
- All shared utilities in a common location, not duplicated per feature
- Color palette is a fixed array — participant colors assigned deterministically by index

**Constraints:** Requires A1 (project setup) and A4 (app shell) for consistent styling context.

**Deliverable:** Shared components render correctly in isolation. Utility functions have working implementations. Used by placeholder pages for loading/empty states.

---

### Stage 1: Parallelization Analysis

**Wave 1** (sequential): A1. Project Setup and Configuration
**Wave 2** (sequential, after A1): A2. Convex Schema and Database Setup
**Wave 3** (parallel, after A2): A3. Authentication and User Management, A5. Shared Utilities and UI Components
- A3 and A5 touch different file boundaries (auth providers vs. UI components) and both depend on schema being deployed
**Wave 4** (sequential, after A3): A4. App Shell and Layout
- A4 depends on A3 for Clerk components and route protection

---

## Stage 2: Import Pipeline

**Goal:** The user can drag-and-drop an Apple Messages markdown export file, map participant identities, and watch it get parsed into structured messages in real time. After import completes, the conversation appears in the sidebar and messages are ready for browsing. Embeddings generate in the background.

### B1. File Upload and Header Scanning

**Description:** Build the import page with drag-and-drop file upload, client-side header scanning to extract participant names and metadata, and initial import job creation. This is the entry point of the import pipeline.

**Spec Reference:** See App Specification: F1. Import Conversations

**Features:**
- Drag-and-drop zone and file picker accepting `.md` and `.txt` files
- Client-side `FileReader` to read file content as text
- Header scanner that extracts: conversation title from `# Messages with [Name]`, contact info, export date, total message count, and all unique participant names by scanning for the `**Name**` pattern in message lines
- Import job creation mutation that records the upload and transitions to "uploading" status

**UI/UX Details:**
- Large, visually prominent drop zone with dashed border and icon
- File validation feedback (wrong file type, empty file)
- Extracted metadata shown as confirmation before proceeding to identity resolution

**Technical Decisions:**
- File content sent directly to Convex (not via Convex file storage) — text files are small enough for mutation payloads when chunked
- Header scanning happens entirely client-side for instant feedback

**Constraints:** Requires A2 (schema) for `importJobs` table and A3 (auth) for user context.

**Deliverable:** User can select or drag a markdown file, see extracted participant names and metadata, and an import job is created in Convex.

---

### B2. Identity Resolution UI

**Description:** After header scanning, present the user with an identity resolution interface: map "Me" to their real name, match extracted participant names against existing participants, and create new participant records as needed.

**Spec Reference:** See App Specification: F1. Import Conversations — Identity Resolution

**Features:**
- "Who is Me?" prompt — dropdown or text input to specify the user's real name (pre-filled from user profile `realName`)
- Participant list showing all names found in the file
- Match suggestions against existing participants (fuzzy match on `displayName` and `aliases`)
- Create new / merge with existing toggle per participant
- Alias recording: if a participant name differs from the canonical name, add it to their `aliases` array
- Confirmation step before proceeding to parsing

**UI/UX Details:**
- Step-by-step wizard flow: Upload -> Identity Resolution -> Parsing
- Each participant shown with their name, a match/create toggle, and the suggested existing match (if any)
- Clear visual distinction between new participants (will be created) and matched participants (will be linked)

**Technical Decisions:**
- Participant matching queries the `search_name` search index and `by_userId_displayName` index
- Decision D2: "Me" identity mapped during import via user prompt

**Constraints:** Requires B1 (file upload and header scanning) for participant name extraction. Requires existing participant records from prior imports (if any) for matching.

**Deliverable:** User resolves all participant identities. Participant records are created or linked. Pipeline is ready to proceed to message parsing.

---

### B3. Message Parser

**Description:** Build the core markdown parser that transforms Apple Messages export format into structured message records. This is the parsing engine — no UI, no batching orchestration, just the parser logic and its tests.

**Spec Reference:** See App Specification: F1. Import Conversations — Parser Support

**Features:**
- Parse day section headers (`## January 1, 2023`) into date context
- Parse timestamped messages (`12:03 AM - **Rob Sawyer**`) extracting time, sender, and content
- Handle blockquoted content (`> message text`) — concatenate multi-line blockquotes into single messages
- Detect and parse reactions: `Liked`, `Loved`, `Laughed at`, `Disliked`, `Emphasized`, `Questioned` — with quoted text extraction
- Detect image references: `![Image: filename](attachments/N_filename)` — set `messageType: "image"`
- Detect video references: `[Video: filename](attachments/N_filename)` — set `messageType: "video"`
- Detect link messages with plugin attachments
- Detect missing attachment markers: `*[Attachment not found: filename]*`
- Multi-line message handling (consecutive blockquote lines belong to the same message)
- Generate `dateKey` (ISO date string) for each message
- Compute full `timestamp` (epoch ms) combining day header date and message time

**Technical Decisions:**
- Parser is a pure function: takes raw text + participant mapping, returns structured message/reaction arrays
- State machine approach: track current day, current sender, current message accumulator
- Decision D1: Per-message storage granularity
- Decision D3: Text-only for v1 — record attachment metadata but don't store files

**Constraints:** Must handle 51K+ line files. Parser logic is synchronous and stateless (batching is B4's concern).

**Deliverable:** Parser function processes the real export file format correctly. All message types, reactions, and attachments are handled. Unit tests validate against known input/output pairs.

---

### B4. Batched Import Pipeline

**Description:** Orchestrate the full server-side import pipeline: batched message parsing, reaction resolution, daily stats aggregation, and import job progress tracking. Uses Convex scheduler chaining to stay within action timeouts.

**Spec Reference:** See App Specification: Technical Architecture — Import Pipeline

**Features:**
- Conversation record creation from parsed header metadata
- Batched message insertion (~2,000 messages per action invocation)
- Scheduler chaining: each batch writes via `ctx.runMutation`, then schedules the next batch via `ctx.scheduler.runAfter(0, ...)`
- Reaction resolution pass: match `quotedText` against recent messages to resolve `messageId` links, update `hasReactions` flags
- Daily stats aggregation: compute per-day message counts, upsert `dailyStats` records with conversation and participant breakdowns
- Import job status transitions: uploading -> parsing -> embedding -> completed/failed
- Real-time progress updates: `parsedMessages` counter updated after each batch
- Error handling: catch and record errors, set job to "failed" status with error message
- Conversation metadata finalization: set `dateRange`, `messageCount`, `participantIds`

**UI/UX Details:**
- Import progress bar showing parsing progress (parsedMessages / totalMessages estimated from line count)
- Status text indicating current pipeline stage
- Real-time updates via Convex reactive queries on `importJobs`

**Technical Decisions:**
- Decision D8: Pre-aggregated daily stats computed during import
- Decision D9: Reactions stored separately, resolved by quoted text matching
- ~2,000 messages per batch keeps each action well within Convex's 10-minute timeout
- Scheduler chaining with `runAfter(0, ...)` — zero delay, just yields the thread

**Constraints:** Requires B3 (parser) for parsing logic, B2 (identity resolution) for participant IDs, A2 (schema) for all tables and indexes. Must handle 50K+ line files within Convex constraints.

**Deliverable:** Full file imported into structured records. Daily stats computed. Reactions resolved. Import job shows "completed" status. Conversation appears in query results.

---

### B5. Background Embedding Generation

**Description:** After parsing completes, generate Voyage-3-lite embeddings for all messages in the background. Uses batched API calls with rate limit handling. Users can browse messages immediately — embedding progress tracked separately.

**Spec Reference:** See App Specification: Technical Architecture — Embedding Strategy

**Features:**
- Batched embedding generation: 100 messages per Voyage API call
- Contextual window construction: for each message, build `[Sender] to [Recipients] on [Date]: [prev] [current] [next]` text
- Write embeddings back to message records
- Progress tracking via `importJobs.embeddedMessages` counter
- Rate limit handling with exponential backoff via `ctx.scheduler.runAfter(delay, ...)`
- Import job transitions from "embedding" to "completed" when all embeddings are written
- Skip messages that already have embeddings (idempotent for retries)

**Technical Decisions:**
- Decision D7: Voyage-3-lite, 1024 dimensions, cosine similarity
- 3-message contextual window gives semantic meaning to short replies ("ok", "lol", "sure")
- Embedding generation is decoupled from parsing — browse available immediately after parsing
- Cost: ~$0.02/1M tokens, negligible at expected scale

**Constraints:** Requires B4 (import pipeline) to have completed parsing. Requires Voyage AI API key in environment variables. Rate limits may slow generation for large conversations.

**Deliverable:** All messages have embeddings stored. Vector index is populated. Search and AI chat features can use vector search against this conversation.

---

### Stage 2: Parallelization Analysis

**Wave 1** (sequential): B1. File Upload and Header Scanning
**Wave 2** (sequential, after B1): B2. Identity Resolution UI
**Wave 3** (parallel, after B2): B3. Message Parser (can be built independently as a pure function)
- B3 is a pure parsing module with no UI — could be built in parallel with B2 if parser format is well-defined, but sequencing after B2 is safer since identity resolution informs the participant mapping the parser needs
**Wave 4** (sequential, after B3): B4. Batched Import Pipeline
- B4 orchestrates B3's parser in the Convex action environment — must follow B3
**Wave 5** (sequential, after B4): B5. Background Embedding Generation
- B5 runs after parsing completes — depends on messages existing in the database

---

## Stage 3: Browse & Conversations

**Goal:** The user can select a conversation from the sidebar, view messages in an iMessage-style thread with virtualized scrolling, see reactions, navigate by date, and filter by participant in group chats. This is the primary reading experience.

### C1. Conversation List and Sidebar

**Description:** Replace the sidebar conversation list placeholder with a live list of imported conversations. Show participant names, message counts, date ranges, and last activity. Support navigation to the browse view.

**Spec Reference:** See App Specification: F2. Browse Conversations

**Features:**
- Query all conversations for the authenticated user, sorted by most recent activity
- Display each conversation with: title (participant names), message count, date range, last message preview
- Group chat indicator for conversations with 3+ participants
- Click to navigate to `/browse/[conversationId]`
- `/browse` route redirects to the most recently active conversation
- Active conversation highlighted in sidebar

**UI/UX Details:**
- Conversation list in the sidebar "MESSAGES" section
- Each item shows participant names (truncated for long group chats), message count badge, and relative date of last message
- Smooth transition when switching between conversations

**Technical Decisions:**
- Uses `by_userId_importedAt` index for sorted listing
- Conversation metadata (title, messageCount, dateRange) is denormalized — no message-level queries needed for the list

**Constraints:** Requires A4 (app shell) for sidebar structure. Requires at least one imported conversation (from Stage 2) to display data.

**Deliverable:** Sidebar shows all imported conversations. Clicking a conversation navigates to its thread view.

---

### C2. Message Thread View with Virtualized Scrolling

**Description:** Build the iMessage-style message thread view with virtualized scrolling for 14K+ message conversations. Display messages as bubbles with correct alignment, grouping, and day dividers.

**Spec Reference:** See App Specification: F2. Browse Conversations

**Features:**
- Virtualized message list using `@tanstack/react-virtual` for performance with 14K+ messages
- iMessage-style bubbles: right-aligned blue for "me" messages, left-aligned gray for others
- Compact grouping: consecutive messages from the same sender within 2 minutes render without repeated sender name, with tighter vertical spacing
- New sender or >2-minute gap shows full bubble with sender name
- Day divider headers between date boundaries
- Timestamps shown on hover (not permanently displayed)
- Participant color coding in group chats (colors from participant records)
- Attachment type indicators: image icon, video icon, missing attachment warning badge
- Scroll to bottom on initial load, maintain scroll position on window resize

**UI/UX Details:**
- Message bubbles with rounded corners, appropriate padding, and max-width constraints
- "Me" bubbles in a distinct blue shade; other participants use their assigned `avatarColor`
- Day dividers styled as centered pills with date text
- Hover timestamp appears as a subtle tooltip
- Smooth scrolling behavior

**Technical Decisions:**
- `@tanstack/react-virtual` with dynamic row heights — message height varies by content length
- Paginated data loading via Convex `.paginate()` on `by_conversationId_timestamp` index
- Messages loaded in timestamp order (oldest first for natural reading, scroll starts at bottom)

**Constraints:** Requires C1 (conversation list) for navigation. Must handle 14K+ messages without performance degradation. Dynamic row heights with virtualization requires careful measurement.

**Deliverable:** User can scroll through an entire conversation smoothly. Messages display correctly with grouping, colors, and day dividers. Performance is acceptable for 14K+ messages.

---

### C3. Reactions Display

**Description:** Fetch and display reaction emoji chips below the messages they reference. Reactions appear as small badges grouped by type.

**Spec Reference:** See App Specification: F2. Browse Conversations — Reactions

**Features:**
- Query reactions for visible messages using `by_messageId` index
- Display reaction chips below the reacted-to message bubble
- Group reactions by type: show emoji + count if multiple of same type
- Reaction chip shows who reacted on hover
- Only fetch reactions for messages with `hasReactions: true` flag

**UI/UX Details:**
- Reaction chips are small, pill-shaped badges positioned below the message bubble
- Emoji displayed at a readable size with count next to it
- Hover tooltip lists reactor names (e.g., "Mom, Rob")
- Chips aligned to the same side as the message bubble (right for "me", left for others)

**Technical Decisions:**
- Decision D9: Reactions stored separately, linked by resolved `messageId`
- `hasReactions` flag prevents unnecessary reaction queries for most messages
- Reactions loaded in a separate query from messages to avoid slowing the primary message fetch

**Constraints:** Requires C2 (message thread view) for the rendering context. Requires B4 (import pipeline) to have resolved reaction-to-message links.

**Deliverable:** Reaction emoji chips display correctly below reacted-to messages. Hover shows reactor names.

---

### C4. Date Navigation and Participant Filter

**Description:** Add date navigation (jump to a specific day within a conversation) and participant filtering (show only messages from selected people in group chats).

**Spec Reference:** See App Specification: F2. Browse Conversations

**Features:**
- Date jumper: date picker or calendar widget that scrolls the thread to the selected day
- Participant filter dropdown in group chats: multi-select to show only messages from chosen participants
- Filter state maintained during conversation viewing but reset on conversation switch
- Message count indicator showing filtered vs. total messages when filter is active

**UI/UX Details:**
- Date jumper accessible from a toolbar above the message thread
- Participant filter dropdown appears only for group chats (conversations with `isGroupChat: true`)
- Filtered messages still show day dividers for context
- Clear filter button to return to full conversation view

**Technical Decisions:**
- Date navigation uses `by_conversationId_dateKey` index to find the scroll position
- Participant filtering is client-side on already-loaded messages (with virtualization, all messages are in memory via pagination)
- Filter state managed with Zustand or component state — not persisted

**Constraints:** Requires C2 (message thread view) for the rendering infrastructure.

**Deliverable:** User can jump to any date in a conversation. Group chat conversations support participant filtering.

---

### Stage 3: Parallelization Analysis

**Wave 1** (sequential): C1. Conversation List and Sidebar
**Wave 2** (sequential, after C1): C2. Message Thread View with Virtualized Scrolling
- C2 depends on C1 for navigation to the thread view
**Wave 3** (parallel, after C2): C3. Reactions Display, C4. Date Navigation and Participant Filter
- C3 and C4 both augment the thread view but touch different concerns (reactions query/display vs. navigation/filtering) with distinct file boundaries

---

## Stage 4: Calendar Visualization

**Goal:** The user can view a GitHub-contribution-style heatmap of their message activity over time, filter by conversation or participant, and drill down into any day's messages.

### D1. Calendar Heatmap Component

**Description:** Build the calendar heatmap visualization showing message activity across a full year. Reads from the pre-aggregated `dailyStats` table for efficient rendering.

**Spec Reference:** See App Specification: F3. Calendar Heatmap

**Features:**
- 52-column x 7-row grid (one year of days)
- 5-level color intensity based on daily message count (0, 1-5, 6-20, 21-50, 51+)
- Month labels along the top
- Day-of-week labels along the left (Mon, Wed, Fri typical)
- Year selector to navigate between years
- Hover tooltips showing: date, total message count, active participants
- Color legend explaining intensity levels

**UI/UX Details:**
- GitHub-contribution-style grid with square cells and subtle borders
- Green-shade intensity scale (or customizable palette matching dark mode)
- Responsive: grid scales to fit container width
- Year selector as a simple dropdown or arrow-based navigator
- Tooltips appear on hover, disappear on mouse-out

**Technical Decisions:**
- Decision D8: Pre-aggregated `dailyStats` table — query `by_userId_dateKey` for all days in selected year
- O(365) query per year regardless of total message volume
- Client-side rendering of the grid from stats data

**Constraints:** Requires A2 (schema) for `dailyStats` table. Requires B4 (import pipeline) to have computed daily stats during import.

**Deliverable:** Calendar heatmap renders for any year with imported data. Color intensity reflects message volume. Hover tooltips show date and count details.

---

### D2. Calendar Filters

**Description:** Add conversation and participant filters to the calendar heatmap, allowing users to view activity for specific conversations or people.

**Spec Reference:** See App Specification: F3. Calendar Heatmap

**Features:**
- Conversation filter dropdown: show activity for a specific conversation or all
- Participant filter dropdown: show only messages involving specific people
- Filters update the heatmap in real time
- Filter state reflected in URL query parameters for shareability

**UI/UX Details:**
- Filter bar positioned above the heatmap grid
- Dropdown menus populated from user's conversations and participants
- Clear filter buttons to reset to "all"
- Visual indicator when filters are active

**Technical Decisions:**
- `dailyStats.conversationBreakdown` and `participantBreakdown` arrays enable client-side filtering without additional queries
- When filtering by conversation or participant, recompute cell intensity from the breakdown arrays

**Constraints:** Requires D1 (heatmap component) for the base visualization.

**Deliverable:** User can filter the heatmap by conversation and/or participant. Heatmap updates reactively.

---

### D3. Calendar Day Detail View

**Description:** Build the day detail view (`/calendar/[dateKey]`) showing all messages from a selected day, grouped by conversation.

**Spec Reference:** See App Specification: F3. Calendar Heatmap — Calendar Day Detail View

**Features:**
- All messages from the selected day across all conversations (or filtered by conversation/participant)
- Messages grouped by conversation with conversation title banners
- Previous/next day navigation arrows
- Message count header ("42 messages on January 15, 2023")
- Messages displayed in chronological order within each conversation group
- Click on a message to navigate to its position in the browse view

**UI/UX Details:**
- Conversation group banners show conversation title and message count for that day
- Previous/next arrows navigate between days that have messages (skip empty days)
- Messages rendered with the same bubble styling as the browse view (reuse C2 components)
- Back-to-heatmap navigation

**Technical Decisions:**
- Query `by_userId_dateKey` index for cross-conversation day view
- Query `by_conversationId_dateKey` index when filtered to a specific conversation
- Reuse message bubble components from C2

**Constraints:** Requires D1 (heatmap) for navigation context. Requires C2 (message thread view) for message bubble components.

**Deliverable:** Clicking a heatmap cell navigates to the day detail view. Messages are grouped by conversation. Previous/next navigation works.

---

### Stage 4: Parallelization Analysis

**Wave 1** (sequential): D1. Calendar Heatmap Component
**Wave 2** (parallel, after D1): D2. Calendar Filters, D3. Calendar Day Detail View
- D2 and D3 both build on the heatmap but are independent — D2 adds filter controls to the heatmap page while D3 creates a separate route/page

---

## Stage 5: Search

**Goal:** The user can search across all messages with keyword, semantic, or hybrid search. Results show matching messages with context, and clicking a result navigates to the message in the browse view.

### E1. Keyword Search

**Description:** Implement keyword-based full-text search using Convex's built-in search index on `messages.content`. Includes result formatting with match highlighting.

**Spec Reference:** See App Specification: F4. Search

**Features:**
- Full-text search on `messages.content` via Convex search index
- Filter by: conversation, participant, user scope (automatic)
- Results returned with message content, sender, timestamp, conversation context
- Match term highlighting in result content
- Result count

**Technical Decisions:**
- Uses `search_content` search index with `filterFields: ["userId", "conversationId", "participantId"]`
- Convex full-text search returns relevance-ranked results
- Search query sanitization to handle special characters

**Constraints:** Requires A2 (schema) for search index. Requires imported messages.

**Deliverable:** Keyword search returns relevant messages ranked by relevance. Filter fields work correctly.

---

### E2. Semantic Search

**Description:** Implement semantic search by embedding the user's query with Voyage-3-lite and querying the Convex vector index. Returns the most semantically similar messages.

**Spec Reference:** See App Specification: Technical Architecture — Search Architecture

**Features:**
- Embed user's search query using Voyage-3-lite API
- Query Convex vector index `by_embedding` for top-K similar messages
- Filter by user (required), optionally by conversation
- Return messages with similarity scores
- Post-filter by date range (Convex vector search doesn't support range filters)
- Post-filter by participant

**Technical Decisions:**
- Decision D7: Voyage-3-lite for query embedding (same model used for message embeddings)
- Convex vector search returns up to 256 results per query — sufficient for search use case
- Date range and participant filtering applied as post-filters on vector results

**Constraints:** Requires B5 (embedding generation) to have populated embeddings. Requires Voyage AI API key.

**Deliverable:** Semantic search returns semantically relevant messages. Similarity scores are meaningful.

---

### E3. Hybrid Search and Result Merging

**Description:** Combine keyword and semantic search results using Reciprocal Rank Fusion (RRF). Include surrounding context messages with each result.

**Spec Reference:** See App Specification: Technical Architecture — Search Architecture — Result Merging

**Features:**
- Run keyword search and semantic search in parallel
- Merge results using Reciprocal Rank Fusion (RRF) with k=60
- Score formula: `score = sum(1 / (60 + rank))` for each result appearing in any result set
- Deduplicate messages appearing in both result sets
- For each result, fetch 1-2 surrounding messages (before and after) for context
- Final results sorted by merged RRF score
- Support all three search modes: Keyword only, Semantic only, Hybrid (default)

**Technical Decisions:**
- RRF with k=60 is a standard fusion constant that balances both ranking signals
- Context expansion queries `by_conversationId_timestamp` index for surrounding messages
- Parallel execution of keyword + semantic search via Convex actions

**Constraints:** Requires E1 (keyword search) and E2 (semantic search) as building blocks.

**Deliverable:** Hybrid search produces well-ranked results combining both signals. Each result includes surrounding context.

---

### E4. Search UI

**Description:** Build the search page with search input, mode toggle, filter bar, and result display. Support click-through to the browse view.

**Spec Reference:** See App Specification: F4. Search

**Features:**
- Search input field with 300ms debounce
- Search mode toggle: Keyword / Semantic / Hybrid (default: Hybrid)
- Filter bar: conversation selector, participant selector, date range picker, message type filter
- Results displayed as message bubbles with highlighted match terms
- Each result shows surrounding context messages (dimmed/smaller)
- Result count and distribution stats ("Found 47 results in 12 conversations")
- Click result to navigate to `/browse/[conversationId]` scrolled to that message with the target highlighted
- Empty state with search suggestions
- Loading state during search execution

**UI/UX Details:**
- Search input is prominent at the top of the page
- Mode toggle as a segmented control (three options)
- Filter bar below the search input with dropdowns and date picker
- Results rendered as message bubbles consistent with browse view styling
- Match terms highlighted with a background color
- Context messages shown in a lighter/smaller style around the matched message
- Click-through navigates and highlights the target message in the browse view

**Technical Decisions:**
- 300ms debounce prevents excessive API calls during typing
- Search state managed with URL query parameters for bookmark/share support
- Results pagination if more than ~50 results

**Constraints:** Requires E3 (hybrid search) for the search backend. Requires C2 (message thread view) for click-through navigation and scroll-to-message behavior.

**Deliverable:** Full search UI with all three modes, filters, and click-through to browse. Search results are relevant and well-presented.

---

### Stage 5: Parallelization Analysis

**Wave 1** (parallel): E1. Keyword Search, E2. Semantic Search
- E1 and E2 are independent search implementations — keyword uses the text search index, semantic uses the vector index. Distinct API boundaries.
**Wave 2** (sequential, after Wave 1): E3. Hybrid Search and Result Merging
- E3 combines E1 and E2 — must follow both
**Wave 3** (sequential, after Wave 2): E4. Search UI
- E4 is the frontend consuming E3's backend — must follow E3

---

## Stage 6: AI Chat

**Goal:** The user can have AI-powered conversations about their message archive. Claude retrieves relevant messages using RAG, streams responses in real time, and attributes sources. Multiple chat sessions with configurable model and thinking settings.

### F1. Chat Session Management

**Description:** Build the AI chat session infrastructure: create, list, switch between, and delete chat sessions. Set up the chat page layout with session list and active chat pane.

**Spec Reference:** See App Specification: F5. AI Chat

**Features:**
- Create new chat session with default model and thinking preferences
- List chat sessions sorted by last activity
- Switch between sessions — chat history loads from database
- Delete sessions (with confirmation)
- Auto-generate session title from first user message (or allow manual naming)
- Session-level scope control: optionally restrict to specific conversations, participants, or date ranges
- Model selector: Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- Extended thinking toggle

**UI/UX Details:**
- Two-panel layout: session list on the left, active chat on the right
- New chat button prominently placed
- Session list items show title, model badge, last activity timestamp
- Active session highlighted
- Scope controls accessible via a settings icon on the chat pane
- Model selector and thinking toggle in the chat pane header

**Technical Decisions:**
- Chat sessions stored in `chatSessions` table with full Convex reactivity
- Session scope stored as `contextScope` object — `null` means "search all messages"
- `by_userId_lastActivity` index for sorted listing

**Constraints:** Requires A4 (app shell) for layout integration.

**Deliverable:** User can create, list, switch, and delete chat sessions. Model and thinking preferences are configurable per session.

---

### F2. RAG Retrieval Pipeline

**Description:** Build the retrieval pipeline that assembles relevant message context for AI responses. Includes query classification, vector search, date-based loading, hybrid merging, and context window management.

**Spec Reference:** See App Specification: Technical Architecture — AI Chat RAG Pipeline

**Features:**
- Query classification via Haiku 4.5 call: determine retrieval strategy (`date_load`, `vector`, `hybrid`)
- Date-load retrieval: query `by_conversationId_dateKey` or `by_userId_dateKey` indexes for all messages on specified dates
- Vector retrieval: embed query with Voyage-3-lite, vector search top-40 results, expand ±5 messages around each hit, deduplicate, sort chronologically, group by day
- Hybrid retrieval: run both strategies, merge and deduplicate
- Context window management with budget allocation:
  - System prompt: ~500 tokens
  - Chat history: min(5,000 tokens, 10% of available)
  - Retrieved context: remaining budget
  - Response budget: 8,192 tokens (16,000 with thinking)
- Overflow prioritization: highest similarity first, complete days over partial, recency bias
- Format retrieved messages for the AI prompt with sender, date, and conversation context

**Technical Decisions:**
- Decision D6: Hybrid RAG with query classification
- Haiku 4.5 for query classification — fast and cheap
- Context window expansion (±5 messages around vector hits) provides conversational context
- Token counting uses approximate character-based estimation (4 chars ≈ 1 token)

**Constraints:** Requires E2 (semantic search) for vector retrieval infrastructure. Requires B5 (embeddings) to be complete for vector search. Requires Anthropic API key and Voyage AI API key.

**Deliverable:** Retrieval pipeline correctly classifies queries and assembles relevant message context within token budgets.

**Prompt and Asset Tracking:**

| Asset | Status | Notes |
|---|---|---|
| Query classification prompt (Haiku) | Not Started | Classifies user queries into `date_load`, `vector`, or `hybrid` retrieval strategies |
| AI chat system prompt | Not Started | Establishes the assistant as a personal message archive explorer with warm conversational tone |

---

### F3. Streaming AI Responses

**Description:** Implement streaming AI responses using Claude API with `@convex-dev/persistent-text-streaming`. Responses stream through Convex for persistence and real-time client updates.

**Spec Reference:** See App Specification: F5. AI Chat, Technical Architecture — AI Chat RAG Pipeline — Step 4

**Features:**
- Create `chatMessages` record with `streamId` before starting generation
- Convex action calls Anthropic API with streaming enabled
- Chunks written to persistent-text-stream via `@convex-dev/persistent-text-streaming`
- Client subscribes reactively to the stream — text appears incrementally
- Extended thinking content captured separately in `thinkingContent` field
- Token usage tracked: `inputTokens`, `outputTokens`
- Finalize message record on stream completion
- Error handling: if API call fails, record error and update UI

**UI/UX Details:**
- AI responses appear word-by-word as they stream
- Typing indicator while waiting for first token
- Extended thinking displayed in a collapsible section above the response (if enabled)
- Smooth text rendering without layout jumps

**Technical Decisions:**
- `@convex-dev/persistent-text-streaming` handles the complexity of streaming through a reactive database
- Stream stored with a unique `streamId` per message
- Thinking content stored separately — never mixed with the visible response

**Constraints:** Requires F1 (session management) for session context. Requires F2 (RAG pipeline) for context assembly. Requires Anthropic API key.

**Deliverable:** AI responses stream in real time through Convex. Extended thinking is captured and displayable. Token usage is recorded.

---

### F4. Chat UI and Message Display

**Description:** Build the chat interface: message input, message history display, markdown rendering in AI responses, copy button, and the empty state with suggestion cards.

**Spec Reference:** See App Specification: F5. AI Chat

**Features:**
- Chat message input with send button and keyboard shortcut (Enter to send)
- Message history display: user messages and assistant messages with distinct styling
- Markdown rendering in AI responses via `react-markdown` + `remark-gfm`
- Extended thinking toggle: collapsible section showing thinking content
- Copy button on AI responses
- Suggestion cards on empty state:
  - "Summarize my conversations with [most frequent participant]"
  - "What were the major events we discussed in [year]?"
  - "Find conversations about [recent topic]"
  - "What's the funniest exchange in my messages?"
- Chat history persisted and loaded from database
- Auto-scroll to latest message

**UI/UX Details:**
- Clean, chat-style interface with clear visual distinction between user and AI messages
- User messages right-aligned, AI messages left-aligned with model badge
- Suggestion cards displayed as clickable cards in a grid on the empty state
- Suggestion cards dynamically populated with real participant names and years from the user's archive
- Markdown rendered with code blocks, lists, bold, italics, links
- Copy button appears on hover over AI messages

**Technical Decisions:**
- `react-markdown` with `remark-gfm` for GitHub-flavored markdown support
- Chat history loaded from `chatMessages` table via `by_sessionId` index
- Suggestion card content generated from queries against conversations and participants tables

**Constraints:** Requires F3 (streaming) for real-time response display. Requires F1 (session management) for session context.

**Deliverable:** Complete chat UI with message display, markdown rendering, suggestions, and copy functionality.

---

### F5. Source Attribution

**Description:** Add source attribution to AI responses — an expandable section showing which archived messages informed each response, rendered as mini message bubbles with click-through to the browse view.

**Spec Reference:** See App Specification: F5. AI Chat — Source Attribution, Key Interaction Patterns

**Features:**
- Expandable "Sources" section below each AI response
- Retrieved messages displayed as mini message bubbles with sender, date, and content preview
- Messages grouped by conversation and date for readability
- Click a source message to navigate to `/browse/[conversationId]` scrolled to that message
- Source count badge on the collapsed section ("12 source messages")
- `retrievedMessageIds` and `retrievalStrategy` stored on each `chatMessages` record

**UI/UX Details:**
- Sources section collapsed by default — expand icon/chevron to reveal
- Mini bubbles are a compact version of the browse view bubbles — smaller text, less padding
- Conversation and date grouping headers within the sources section
- Click-through opens the browse view with the source message highlighted and centered

**Technical Decisions:**
- `retrievedMessageIds` stores the actual message IDs used as context — enables precise source display
- `retrievalStrategy` stored for debugging/transparency ("vector", "date_load", "hybrid")

**Constraints:** Requires F4 (chat UI) for display context. Requires C2 (message thread view) for click-through navigation.

**Deliverable:** Each AI response shows its source messages. Sources are browsable and clickable.

---

### Stage 6: Parallelization Analysis

**Wave 1** (sequential): F1. Chat Session Management
**Wave 2** (sequential, after F1): F2. RAG Retrieval Pipeline
- F2 depends on session scope from F1 to determine retrieval boundaries
**Wave 3** (sequential, after F2): F3. Streaming AI Responses
- F3 depends on F2 for context assembly before calling the Anthropic API
**Wave 4** (parallel, after F3): F4. Chat UI and Message Display, F5. Source Attribution
- F4 and F5 are both frontend components consuming the same streaming/data infrastructure — F4 handles the main chat interface while F5 adds the sources panel. Distinct component boundaries.
- Note: F4 could start during F3 development for the non-streaming parts (input, history, suggestions), but sequencing after F3 is safer for integration.

---

## Stage 7: Dashboard & Settings

**Goal:** The user sees a statistics overview on first login, can manage participants, set preferences, and handle data management. The app feels complete and polished.

### G1. Dashboard

**Description:** Build the dashboard page showing archive statistics, recent activity, a mini calendar heatmap, and quick navigation to conversations and import.

**Spec Reference:** See App Specification: F6. Dashboard

**Features:**
- Stats cards: total messages, total conversations, overall date range, top participants by message count
- Recent activity: last few messages across all conversations (3-5 messages)
- Mini calendar heatmap showing the current year (clickable to navigate to full calendar view)
- Conversation list with quick navigation links
- Import button for quick access to the import flow
- Clerk `<UserButton />` integration (already in top bar from A4)

**UI/UX Details:**
- Stats cards in a responsive grid (2x2 or 4-across depending on viewport)
- Recent activity as a compact message list with conversation context
- Mini heatmap is a smaller version of D1 — shows the current year, click navigates to `/calendar`
- Warm, welcoming tone — "Welcome back, Rob" or similar personalization

**Technical Decisions:**
- Stats computed from aggregate queries: count conversations, sum message counts, find date extremes
- Recent messages query: `by_userId_dateKey` index with descending sort, limit 5
- Mini heatmap reuses the D1 component at a smaller scale

**Constraints:** Requires D1 (calendar heatmap component) for the mini heatmap. Requires Stage 2 (import) for any data to display. Requires C1 (conversation list) for navigation links.

**Deliverable:** Dashboard displays accurate stats, recent activity, and a mini heatmap. Quick navigation works.

---

### G2. User Preferences

**Description:** Build the settings page for user profile and app preferences: display name, real name (used for "Me" mapping), default AI model, thinking toggle, and theme preference.

**Spec Reference:** See App Specification: F7. Settings

**Features:**
- Profile settings: edit display name and real name
- Real name explanation: used to auto-fill the "Me" identity during import
- Default model preference: Claude Opus 4.6, Sonnet 4.6, or Haiku 4.5
- Default thinking toggle: on/off
- Theme preference: dark (default), light, system
- Save preferences to `users.preferences` field
- Success feedback on save

**UI/UX Details:**
- Clean form layout with labeled inputs and dropdowns
- Grouped sections: Profile, AI Preferences, Appearance
- Save button with loading state and success toast
- Theme toggle applies immediately on change (live preview)

**Technical Decisions:**
- Preferences stored in the `users.preferences` object — single mutation to update
- Theme managed via CSS class on `<html>` element — Tailwind dark mode class strategy

**Constraints:** Requires A3 (authentication) for user context.

**Deliverable:** User can view and update all preferences. Changes persist and take effect immediately.

---

### G3. Participant Management

**Description:** Build the participant manager: view all participants across conversations, merge duplicates, edit display names, and change bubble colors.

**Spec Reference:** See App Specification: F7. Settings — Participant Manager

**Features:**
- List all participants with: display name, aliases, conversation count, message count, assigned color
- Edit display name inline
- Change bubble color via color picker or palette selector
- Merge duplicate participants: select two or more, merge into one canonical record
  - Merging updates all message `participantId` references
  - Merging combines `aliases` arrays
  - Merging sums `messageCount` and recalculates `conversationCount`
- Delete a participant (with warning about orphaned messages — only if participant has no messages)

**UI/UX Details:**
- Participant list as a sortable table with columns for name, aliases, conversations, messages, color
- Inline edit mode for display name (click to edit, Enter to save)
- Color picker shows the fixed palette with the current selection highlighted
- Merge flow: select participants via checkboxes, click "Merge," choose the canonical name, confirm
- Merge confirmation dialog warning about the irreversibility

**Technical Decisions:**
- Participant merge is a multi-step mutation: update all `messages.participantId` references, update `conversations.participantIds` arrays, consolidate participant records
- Color palette is a fixed set of 10+ colors assigned by index; manual override via this UI

**Constraints:** Requires imported participants from Stage 2. Merge operation updates messages table — potentially large batch mutation for participants with many messages.

**Deliverable:** User can view, edit, and merge participants. Color changes reflect immediately in the browse view.

---

### G4. Data Management

**Description:** Build data management tools: delete conversations, view storage usage, and import history.

**Spec Reference:** See App Specification: F7. Settings — Data Management

**Features:**
- Import history: list all imports with date, filename, message count, status
- Delete conversation: remove a conversation and all its messages, reactions, and daily stats contributions
  - Confirmation dialog with conversation name and message count
  - Cascade delete: messages, reactions, daily stats updates, embedding data
  - Update participant message/conversation counts
- Storage usage display: total messages, total conversations, total embeddings, estimated storage

**UI/UX Details:**
- Import history as a table with columns: date, filename, messages, status, actions
- Delete button with red styling and confirmation modal
- Storage usage as a simple stats display (not a detailed breakdown)

**Technical Decisions:**
- Conversation deletion is a cascading operation: delete messages, reactions, recompute dailyStats, update participant counts
- Deletion runs as a batched Convex action (similar to import batching) for large conversations
- Import history queries `importJobs` table

**Constraints:** Requires Stage 2 (import pipeline) for import history. Cascading deletes for large conversations may take time — show progress indicator.

**Deliverable:** User can view import history, delete conversations with full cascade, and see storage usage.

---

### Stage 7: Parallelization Analysis

**Wave 1** (parallel): G1. Dashboard, G2. User Preferences
- G1 (dashboard page) and G2 (settings page) are separate pages with distinct file boundaries
**Wave 2** (parallel, after Wave 1): G3. Participant Management, G4. Data Management
- G3 and G4 are both settings sub-features but touch different tables and concerns — participants vs. conversations/imports. However, both are on the settings page, so sequencing after G2 ensures the settings page structure is in place.
- G3 and G4 can run in parallel as they modify different data (participants vs. conversations)

---

## Cross-Stage Dependencies

| Dependency | Source | Target | Notes |
|---|---|---|---|
| Convex schema | A2 | All subsequent projects | Every project reads/writes to the schema |
| Authentication | A3 | All user-facing projects | `getUserId(ctx)` required everywhere |
| App shell/layout | A4 | All page-level projects | Sidebar, top bar, route structure |
| Shared utilities | A5 | C2, C3, D1, D3, E4, F4 | Date formatting, color palette, loading states |
| Import pipeline | B4 | C1, D1, E1, F2, G1, G4 | Must have imported data to display |
| Embeddings | B5 | E2, F2 | Vector search requires embeddings |
| Message parser | B3 | B4 | Parser logic consumed by import orchestration |
| Message thread view | C2 | C3, C4, D3, E4, F5 | Message bubble components reused |
| Calendar heatmap | D1 | G1 | Mini heatmap on dashboard reuses D1 |
| Keyword search | E1 | E3 | Hybrid search combines keyword results |
| Semantic search | E2 | E3 | Hybrid search combines vector results |
| RAG pipeline | F2 | F3 | Context assembly feeds streaming response |
| Streaming | F3 | F4, F5 | Chat UI and sources consume streamed responses |

---

## Timeline Estimate

Based on AI-assisted development velocity (3-5x):

| Stage | Projects | Estimated Duration |
|---|---|---|
| Stage 1: Foundation & Auth | 5 | 4-6 hours |
| Stage 2: Import Pipeline | 5 | 6-10 hours |
| Stage 3: Browse & Conversations | 4 | 5-8 hours |
| Stage 4: Calendar Visualization | 3 | 3-5 hours |
| Stage 5: Search | 4 | 5-8 hours |
| Stage 6: AI Chat | 5 | 8-12 hours |
| Stage 7: Dashboard & Settings | 4 | 4-6 hours |
| **Total** | **30** | **35-55 hours (~5-7 working days)** |

Stage 2 (Import) and Stage 6 (AI Chat) are the most complex due to the parsing state machine, batched pipeline orchestration, and RAG retrieval logic respectively. Stage 3 (Browse) requires careful virtualization work. All other stages are straightforward CRUD + UI work.

---

## Prompt and Asset Tracking (Cross-Project)

| Asset | Project | Status | Description |
|---|---|---|---|
| AI Chat System Prompt | F2 | Not Started | Establishes the assistant as a personal message archive explorer; warm conversational tone appropriate for family messages; instructions for using retrieved context |
| Query Classification Prompt (Haiku) | F2 | Not Started | Classifies user queries into `date_load`, `vector`, or `hybrid` retrieval strategies; receives the user's query and recent chat history |
| Suggestion Card Templates | F4 | Not Started | Dynamic suggestion templates populated with real participant names, years, and topics from the user's archive |
