# MessageVault — Getting Started Guide

**For:** Solo developer (Rob) using Claude Code for AI-assisted implementation
**Stack:** Next.js 16.1 + Convex + Clerk + Tailwind 4.2 + shadcn/ui

---

## 1. Prerequisites

**Required:**
- Node.js 22.x LTS (required for Next.js 16.1)
- pnpm 10.x (recommended) or npm 10.x
- Git
- Accounts: Convex, Clerk, Anthropic, Voyage AI, Vercel

**Verify:**
```bash
node --version   # >= 22.0.0
pnpm --version   # >= 10.0.0
```

---

## 2. Repository Setup

### Initialize the Project

```bash
pnpm create next-app@latest messagevault \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --turbopack \
  --src-dir=no \
  --import-alias="@/*"

cd messagevault
```

Next.js 16.1 enables the React Compiler by default. Verify in `next.config.ts` that `reactCompiler` is not explicitly disabled.

### TypeScript Strict Mode

In `tsconfig.json`, confirm these are set (Next.js 16 defaults should cover most):

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Install Dependencies

```bash
# Backend + Auth
pnpm add convex @clerk/nextjs convex-helpers

# UI
pnpm add tailwindcss@latest @tailwindcss/postcss
pnpm add zustand @tanstack/react-virtual react-markdown remark-gfm

# AI + Embeddings (server-side only — used in Convex actions)
pnpm add @anthropic-ai/sdk voyage-ai

# Streaming
pnpm add @convex-dev/persistent-text-streaming

# shadcn/ui (initializes config, installs radix-ui)
pnpm dlx shadcn@latest init
```

When shadcn init prompts, choose: New York style, Zinc base color, CSS variables enabled. This creates `components.json` and a `components/ui/` directory.

Add commonly needed shadcn components up front:

```bash
pnpm dlx shadcn@latest add button card dialog dropdown-menu input label \
  scroll-area separator sheet skeleton tabs tooltip avatar badge
```

### Initialize Convex

```bash
pnpm convex dev
```

This creates the `convex/` directory, generates `convex/_generated/`, and prompts you to create or link a Convex project. Follow the prompts to authenticate and create a new project named "messagevault."

---

## 3. Service Setup

### Convex

1. Run `pnpm convex dev` (done above) — creates the project on Convex Cloud.
2. The CLI writes your deployment URL to `.env.local` as `CONVEX_DEPLOYMENT`.
3. Note the deployment URL (also visible at [dashboard.convex.dev](https://dashboard.convex.dev)) — you'll need `NEXT_PUBLIC_CONVEX_URL` set to the HTTP URL form.
4. In the Convex dashboard, go to Settings → Environment Variables to add server-side secrets (Anthropic key, Voyage key, Clerk issuer URL).

### Clerk

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. For a family app: enable Email/Password sign-in. Disable other social providers unless wanted.
3. Go to **JWT Templates** → create a template named `convex`:
   - Issuer: `https://<your-clerk-domain>` (Clerk shows this)
   - Audience: leave blank or set to `convex`
   - Claims: `{ "sub": "{{user.id}}" }` (Clerk's default `sub` claim works)
4. Copy keys from API Keys page → set in `.env.local`.
5. In Convex dashboard → Settings → Environment Variables, add:
   - `CLERK_ISSUER_URL` = `https://<your-clerk-domain>` (the issuer from JWT template)

### Convex Auth Configuration

Create `convex/auth.config.ts`:

```typescript
// ABOUTME: Convex auth configuration — validates Clerk JWTs for all authenticated operations.
// ABOUTME: References the Clerk issuer URL from environment variables.

const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_ISSUER_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
```

### Anthropic

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Add to Convex environment variables (not `.env.local` — Convex actions run server-side on Convex Cloud).
3. In Convex dashboard → Settings → Environment Variables: `ANTHROPIC_API_KEY`

### Voyage AI

1. Get an API key from [dash.voyageai.com](https://dash.voyageai.com).
2. Add to Convex environment variables: `VOYAGE_API_KEY`
3. Model to use: `voyage-3-lite` (1024 dimensions, cosine similarity).

### Vercel (Can Be Deferred)

1. Install Vercel CLI: `pnpm add -g vercel`
2. Run `vercel link` to connect to a Vercel project.
3. Set environment variables in Vercel dashboard (same as `.env.local` minus `CONVEX_DEPLOYMENT`).
4. Convex has a Vercel integration — install it from the Convex dashboard to auto-set `NEXT_PUBLIC_CONVEX_URL` at deploy time.

---

## 4. Environment Variables

### `.env.local` (Next.js — local development)

```bash
# Convex
CONVEX_DEPLOYMENT=dev:your-deployment-name    # Set by `pnpm convex dev`
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### Convex Dashboard → Environment Variables (server-side secrets for Convex actions)

```bash
CLERK_ISSUER_URL=https://your-clerk-domain.clerk.accounts.dev
ANTHROPIC_API_KEY=sk-ant-xxxxx
VOYAGE_API_KEY=va-xxxxx
```

Note: Anthropic and Voyage keys go in the Convex dashboard, not `.env.local`. Convex actions run on Convex Cloud, not your Next.js server. They access secrets via `process.env` within action code.

---

## 5. Project Structure

```
messagevault/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (provider stack)
│   ├── page.tsx                  # Landing / sign-in (public)
│   ├── (authenticated)/          # Route group — requires auth
│   │   ├── layout.tsx            # Auth-checked layout, sidebar, topbar
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── browse/
│   │   │   ├── page.tsx          # Redirect to most recent conversation
│   │   │   └── [conversationId]/
│   │   │       └── page.tsx
│   │   ├── calendar/
│   │   │   ├── page.tsx          # Heatmap view
│   │   │   └── [dateKey]/
│   │   │       └── page.tsx      # Day detail
│   │   ├── search/
│   │   │   └── page.tsx
│   │   ├── chat/
│   │   │   ├── page.tsx          # Session list
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx
│   │   ├── import/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   └── globals.css               # Tailwind 4.2 CSS-first config
├── components/
│   ├── ui/                       # shadcn/ui components (auto-generated)
│   ├── layout/                   # Sidebar, Topbar, navigation
│   ├── browse/                   # Message bubbles, thread view
│   ├── calendar/                 # Heatmap, day detail
│   ├── search/                   # Search bar, filters, results
│   ├── chat/                     # AI chat session, message, sources
│   ├── import/                   # File upload, identity resolution
│   └── dashboard/                # Stats cards, mini heatmap
├── convex/
│   ├── _generated/               # Auto-generated by Convex CLI
│   ├── auth.config.ts            # Clerk JWT validation config
│   ├── schema.ts                 # Full database schema
│   ├── users.ts                  # User queries/mutations
│   ├── conversations.ts          # Conversation queries
│   ├── messages.ts               # Message queries (paginated, by date)
│   ├── participants.ts           # Participant management
│   ├── reactions.ts              # Reaction queries
│   ├── search.ts                 # Keyword + vector search
│   ├── import.ts                 # Import pipeline actions
│   ├── chat.ts                   # AI chat actions
│   ├── dailyStats.ts             # Calendar heatmap queries
│   ├── importJobs.ts             # Import progress tracking
│   └── lib/
│       ├── auth.ts               # getUserId() helper
│       ├── parser.ts             # Apple Messages markdown parser
│       ├── embeddings.ts         # Voyage AI embedding calls
│       └── rag.ts                # RAG pipeline (classification, retrieval, assembly)
├── lib/
│   ├── stores/                   # Zustand stores
│   │   ├── ui-store.ts           # Modal state, sidebar open, etc.
│   │   └── search-store.ts       # Search filters, mode
│   ├── hooks/                    # Custom React hooks
│   └── utils.ts                  # Shared utilities (cn(), formatters)
├── public/
├── .env.local
├── convex.json                   # Convex project config (auto-generated)
├── components.json               # shadcn/ui config
├── next.config.ts
├── tailwind.config.ts            # Minimal — Tailwind 4.2 uses CSS-first
├── tsconfig.json
└── package.json
```

Key structural decisions:
- **Route group `(authenticated)/`** wraps all post-login routes. The group layout checks auth state and renders the sidebar/topbar shell. The root `page.tsx` stays outside for the public landing/sign-in page.
- **`convex/lib/`** holds shared backend utilities — parser, embedding client, RAG logic, auth helper.
- **`components/` organized by feature**, not by type. Each feature directory contains its own components.
- **Zustand stores in `lib/stores/`** for ephemeral UI state only. All persistent state lives in Convex.

---

## 6. Provider Stack

Root layout (`app/layout.tsx`) wraps the app in providers in this order:

```tsx
// ABOUTME: Root layout — sets up the provider stack for auth, real-time backend, and theming.
// ABOUTME: ClerkProvider wraps ConvexProviderWithClerk; Convex validates Clerk JWTs for all operations.

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { dark } from "@clerk/themes";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ClerkProvider
          appearance={{ baseTheme: dark }}
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
        >
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            {children}
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </body>
    </html>
  );
}
```

Important: `ConvexReactClient` must be instantiated outside the component (module scope) so it's created once.

---

## 7. Development Workflow

### Running the Dev Servers

You need two terminals (or use a process manager):

```bash
# Terminal 1: Convex dev server (watches convex/ for changes, syncs to cloud)
pnpm convex dev

# Terminal 2: Next.js dev server (Turbopack)
pnpm dev
```

The Convex CLI watches your `convex/` directory and pushes schema/function changes to your dev deployment in real time. The Next.js dev server runs locally with Turbopack.

### Common Commands

```bash
pnpm dev                    # Start Next.js dev server
pnpm convex dev             # Start Convex dev watcher
pnpm build                  # Production build (DO NOT run while dev server is running)
pnpm convex deploy          # Deploy Convex to production
pnpm dlx shadcn@latest add <component>  # Add a shadcn/ui component
pnpm convex env set KEY value           # Set Convex env var from CLI
```

### Important: Build vs Dev

Never run `pnpm build` while the Next.js dev server is running — this corrupts the `.next` cache and causes CSS/JS 404s. Stop the dev server first.

---

## 8. Code Conventions

### ABOUTME Comments

Every code file starts with a two-line comment explaining the file's purpose:

```typescript
// ABOUTME: Convex schema definition for all MessageVault tables.
// ABOUTME: Defines indexes, search indexes, and vector indexes for messages, conversations, participants.
```

Both lines prefixed with `ABOUTME:` for grepability across the codebase.

### Tailwind CSS 4.2 — CSS-First Configuration

Tailwind 4.2 uses CSS-first configuration via `@theme` in your CSS file, not `tailwind.config.ts`. The config file is minimal or absent.

In `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.65 0.2 250);
  --color-bubble-me: oklch(0.45 0.15 250);
  --color-bubble-other: oklch(0.25 0.01 260);
  --font-sans: "Inter", system-ui, sans-serif;
  /* Define your full theme here */
}
```

This replaces the `theme.extend` pattern from Tailwind 3.x. No JavaScript config needed for theming.

### TypeScript

- Strict mode enabled (see tsconfig above).
- Use Convex's generated types (`convex/_generated/dataModel`) for all database types.
- Prefer `v.object()` schema definitions in Convex — they generate TypeScript types automatically.
- Use `Doc<"messages">` and `Id<"messages">` from the generated types, never hand-roll document types.

### Naming

- Files: kebab-case (`message-bubble.tsx`, `daily-stats.ts`)
- Components: PascalCase (`MessageBubble`, `CalendarHeatmap`)
- Convex functions: camelCase (`getMessages`, `createImportJob`)
- Zustand stores: camelCase with `use` prefix (`useUIStore`, `useSearchStore`)

---

## 9. Recommended Order of Attack

### Start with Stage 1: Foundation

The implementation plan will formalize this, but the natural build order is:

**1. Project scaffolding + schema** — Get the Next.js project running, Convex connected, Clerk authenticating, and the full database schema deployed. This validates the entire stack integration before writing any feature code.

**2. Auth flow + user creation** — Landing page with Clerk `<SignIn />`, redirect to `/dashboard`, just-in-time user record creation in Convex on first authenticated query. Test the full round trip: sign in → Clerk JWT → Convex validates → user record created.

**3. Import pipeline** — This is the core data ingestion. Without messages in the database, no other feature can be tested with real data. Build the markdown parser, file upload, batched message creation, and basic import progress UI. Skip embedding generation initially — add it after search/AI chat.

**4. Browse view** — The iMessage-style thread viewer. This is the primary way to validate that the parser produced correct data. Build message bubbles, conversation list, virtualized scrolling.

**5. Calendar heatmap** — Requires dailyStats (computed during import). A good validation that import is producing correct date-keyed data.

**6. Search** — Requires embeddings. Add the Voyage AI embedding pipeline to import, build keyword search first (simpler, no embeddings needed), then add semantic search and RRF merging.

**7. AI Chat** — Requires search infrastructure (vector search) plus Anthropic integration. Build the RAG pipeline, streaming response display, session management.

**8. Settings + polish** — Participant management, preferences, UI polish, edge cases.

### What to Validate First

Before writing any feature code, confirm this minimal stack works end-to-end:

1. Next.js app loads at `localhost:3000`
2. Clerk sign-in renders and authenticates
3. After sign-in, a Convex query fires and successfully validates the Clerk JWT
4. A Convex mutation creates a user record
5. The user record appears in the Convex dashboard data viewer

If any step fails, debug it before proceeding. Stack integration issues caught here save hours later.

---

## 10. Common Gotchas

### Next.js 16.1 + Convex

- **Client vs. server components:** Convex hooks (`useQuery`, `useMutation`) are client-side only. Any component using them must be a Client Component (`"use client"`). Page components that use Convex data directly need the directive. Alternatively, create a thin client wrapper component.
- **React Compiler:** Next.js 16.1 enables the React Compiler by default. This generally works well but can interfere with Zustand's selector pattern if you use inline arrow functions as selectors. Extract selectors as stable references if you see unexpected re-renders.

### Convex

- **Schema deployment:** After editing `convex/schema.ts`, the Convex CLI pushes the new schema automatically when `pnpm convex dev` is running. If you add indexes, they build asynchronously — queries using the new index may fail briefly until the index is ready. The dashboard shows index build status.
- **Vector index caveats:** Convex vector search only supports equality filters on `filterFields`, not range queries. Date range filtering for search must be done as a post-filter on the vector search results. Plan your `filterFields` carefully — you can't change them without reindexing.
- **Action vs. mutation vs. query:** Queries are reactive and cached. Mutations are transactional writes. Actions can call external APIs (Anthropic, Voyage) but are NOT reactive and NOT transactional. Actions call mutations via `ctx.runMutation()` to write data. The import pipeline and AI chat responses are actions.
- **Scheduler chaining:** For long-running work (import batches, embedding generation), use `ctx.scheduler.runAfter(0, ...)` to chain actions. Each action gets a fresh 10-minute timeout. Pass continuation state as arguments (e.g., batch offset, import job ID).
- **`_creationTime`:** Every Convex document has a `_creationTime` field automatically. Don't add your own `createdAt` unless you need a different semantic (like `importedAt` which means when the import happened, not when the record was created — though in practice these are the same).

### Clerk + Convex Integration

- **JWT template name matters:** The JWT template in Clerk must be named `convex` (lowercase). The `ConvexProviderWithClerk` component looks for this template by default.
- **Issuer URL format:** The `CLERK_ISSUER_URL` in Convex env vars must match the issuer in your Clerk JWT template exactly. No trailing slash. Format: `https://<your-domain>.clerk.accounts.dev`
- **Just-in-time user creation:** Don't use Clerk webhooks for user sync. Instead, the first Convex operation after sign-in checks for an existing user record and creates one if missing. This is simpler and avoids webhook delivery issues.
- **`getUserId` helper pattern:** Create a shared `convex/lib/auth.ts` that exports an async function taking `ctx` and returning the user's Convex `Id<"users">`. Every query/mutation calls this first. It handles JWT validation, user lookup, and JIT creation.

### Tailwind 4.2

- **No `tailwind.config.ts` theme:** Theme values go in `@theme {}` in your CSS file. If you need a JS config file at all, it's only for plugins or content paths — not colors, spacing, or fonts.
- **`@import "tailwindcss"` replaces directives:** Don't use `@tailwind base; @tailwind components; @tailwind utilities;` — use the single `@import "tailwindcss";` statement.

### shadcn/ui

- **Unified radix-ui package:** Latest shadcn/ui uses `@radix-ui/react-*` as a single unified package. Don't install individual Radix packages — shadcn handles dependencies.
- **Dark mode:** Configure dark mode in `components.json` and ensure your root `<html>` has `class="dark"` (or use Clerk/next-themes for toggling).

### General

- **Convex env vars vs. `.env.local`:** Client-accessible env vars (`NEXT_PUBLIC_*`) and Clerk keys go in `.env.local`. API keys used in Convex actions (Anthropic, Voyage) go in the Convex dashboard. Convex actions run on Convex Cloud, not your machine — they don't see your `.env.local`.
- **Hot reload with two servers:** Changes to `convex/` are handled by `pnpm convex dev`. Changes to `app/` and `components/` are handled by `pnpm dev`. Both must be running. If Convex functions seem stale, check that the Convex CLI is still running.
- **File size for imports:** The Apple Messages export files can be 700K+ characters. `FileReader.readAsText()` handles this fine client-side, but sending the full content in a single Convex mutation argument has a 1MB limit. For very large files, consider chunking or using Convex file storage. At 700K characters this is under 1MB, but monitor.
