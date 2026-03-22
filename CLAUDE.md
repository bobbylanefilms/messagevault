# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MessageVault is a family-focused web app for importing, browsing, searching, and chatting with archived Apple Messages text exports. It transforms raw markdown exports (51K+ lines, 700K+ characters) into a structured, searchable, AI-powered archive. Target audience is 2-3 family users, not a public product.

## Tech Stack

- **Frontend:** Next.js 16.1 (App Router, Turbopack, React Compiler), React 19.2+, TypeScript 5.7+ (strict)
- **Styling:** Tailwind CSS 4.2 (CSS-first `@theme` config in `app/globals.css`, single `@import "tailwindcss"`, no `@tailwind` directives)
- **Components:** shadcn/ui (unified radix-ui package)
- **Backend/Database:** Convex (reactive, real-time, native vector search)
- **Auth:** Clerk (@clerk/nextjs, `ConvexProviderWithClerk` wrapper)
- **State:** Zustand (ephemeral UI state only — all persistent state in Convex)
- **AI:** Anthropic SDK (Opus 4.6, Sonnet 4.6, Haiku 4.5) + Voyage AI `voyage-3-lite` (1024-dim embeddings). npm package is `voyageai` (not `voyage-ai`)
- **Virtualization:** @tanstack/react-virtual
- **Deployment:** Vercel preview (frontend) + Convex dev (backend) — development mode only

## Development Environment

This app runs on **port 3002** during development. All services (Convex, Vercel, Clerk) stay in development/preview mode — no custom domain, no production deployment planned.

## Development Commands

```bash
# Two terminals required for development:
pnpm convex dev          # Terminal 1: Convex dev watcher
pnpm dev --port 3002     # Terminal 2: Next.js dev server on port 3002

# Build (for local verification only — no production deploys)
pnpm build               # NEVER run while dev server is running

# Utilities
pnpm dlx shadcn@latest add <component>   # Add shadcn/ui components
pnpm convex env set KEY value            # Set Convex environment variables
```

## Architecture

### Routing & Layout

- `app/(authenticated)/` route group wraps all post-login routes with auth check, sidebar, and topbar shell
- `app/page.tsx` is the public landing/sign-in page
- Routes: `/dashboard`, `/browse/[conversationId]`, `/calendar`, `/calendar/[dateKey]`, `/search`, `/chat`, `/chat/[sessionId]`, `/import`, `/settings`

### Backend (Convex)

- `convex/schema.ts` defines 9 tables: users, conversations, participants, messages, reactions, dailyStats, chatSessions, chatMessages, importJobs
- `convex/lib/` contains shared backend utilities: `auth.ts` (getUserId helper), `parser.ts` (Apple Messages parser), `embeddings.ts` (Voyage AI), `rag.ts` (RAG pipeline)
- Every table has `userId` field; data isolation enforced at query level via indexes
- Just-in-time user creation on first Convex operation (no webhook)

### Frontend Organization

- Components organized by feature (`components/browse/`, `components/calendar/`, etc.), not by type
- Zustand stores in `lib/stores/` for ephemeral UI state only
- Convex hooks (`useQuery`, `useMutation`) are client-only — components using them need `"use client"` directive

### Import Pipeline (7 stages, batched)

Client upload → identity resolution → header parsing → batched message parsing (~2K/batch with scheduler chaining) → reaction resolution → daily stats aggregation → background embedding generation. Users can browse after stage 4; embeddings generate asynchronously.

### Search

Three parallel retrievals merged via Reciprocal Rank Fusion (k=60): keyword search (Convex full-text index), semantic search (Voyage embedding → Convex vector index), and metadata filters (participant, conversation, date range, message type).

### AI Chat RAG

Query classification (Haiku) → context retrieval by strategy → context window budget allocation → streaming response via persistent-text-streaming.

## Key Conventions

- Every code file starts with two `ABOUTME:` comment lines explaining the file's purpose
- Files: kebab-case. Components: PascalCase. Convex functions: camelCase. Zustand stores: `use` prefix
- Tailwind 4.2 CSS-first config — theme values in `@theme {}` block in `globals.css`, not in `tailwind.config.ts`
- Dark mode via root `<html class="dark">` + Clerk dark theme

## Environment Variables

**.env.local** (Next.js):
- `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Clerk URL configs pointing to `/` for sign-in/up and `/dashboard` for post-auth

**Convex Dashboard** (server-side secrets for Convex actions):
- `CLERK_ISSUER_URL` — must match Clerk JWT template exactly, no trailing slash
- `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`

## Critical Constraints

- **Never run `pnpm build` while dev server is running** — corrupts `.next` cache, causes CSS/JS 404s
- **Convex 10-minute action timeout** — import pipeline must batch with scheduler chaining
- **Convex vector search** only supports equality filters (not range) — date ranges must be post-filtered
- **Clerk JWT template name must be `convex`** (lowercase)
- **React Compiler enabled** — avoid inline arrow functions as Zustand selectors
- **1MB Convex mutation payload limit** — very large import files need chunking

## Project Planning

- `app-specification.md` — Full app specification (features, data model, UI/UX, constraints)
- `plan.md` — Implementation plan with 30 projects across 7 stages
- `start.md` — Getting started guide with setup steps and dev workflow
- `tracker.md` — Project stage/completion checklist
- `plan/_scenarios/` — Holdout test scenarios (coding agent must never read these)
- `plan/_archive/decision-log.md` — Architectural decisions (D1-D9)

## Implementation Stages

1. Foundation & Auth (A1-A5)
2. Import Pipeline (B1-B5)
3. Browse & Conversations (C1-C4)
4. Calendar Visualization (D1-D3)
5. Search (E1-E4)
6. AI Chat (F1-F5)
7. Dashboard & Settings (G1-G4)

## Tracker Maintenance

After completing each project, update `plan/tracker.md`:
1. Check off the completed project (`[x]`)
2. Update the progress bar and percentage at the top
3. Mark the stage as complete with a checkmark emoji when all projects in that stage are done

The progress bar uses block characters: filled for completed, empty for remaining (30 chars total, 1 per project).
