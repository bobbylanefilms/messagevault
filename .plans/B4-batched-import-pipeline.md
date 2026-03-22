# B4: Batched Import Pipeline — Execution Plan

## 1. Problem Summary

**What:** Orchestrate the complete server-side import pipeline: receive parsed file content, batch message insertion (~2,000 messages per action), handle reaction resolution, compute daily stats, and track import progress — all using Convex scheduler chaining to stay within the 10-minute action timeout.

**Why:** This connects the parser (B3) to the database, making imported conversations available for browsing. Without B4, the parser output has nowhere to go. B4 also handles deduplication (re-imports), reaction linking, and daily stats aggregation needed by the calendar feature.

**Success criteria:**
- Full 51K-line, 15K-message file imports successfully
- Messages are inserted in ~2,000-message batches via scheduler chaining
- Duplicate messages (same timestamp + sender + content) are skipped and counted
- Reactions are resolved to their target messages by quoted text matching
- Daily stats are aggregated into `dailyStats` records
- Import job status transitions: uploading -> parsing -> embedding -> completed
- Real-time progress visible via reactive queries on `importJobs`
- Conversation metadata finalized with correct dateRange and messageCount

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/convex/lib/parser.ts` | Parser (from B3) | **Read-only** — call `parseAppleMessages()` |
| `/Users/robert.sawyer/Git/messagevault/convex/lib/auth.ts` | `getUserId()` | **Read-only** — auth gate |
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Full schema | **Read-only** — reference for all tables |
| `/Users/robert.sawyer/Git/messagevault/convex/importJobs.ts` | Import job CRUD (from B1) | **Modify** — add status update mutations |
| `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx` | Import wizard | **Modify** — add parsing progress UI |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/import.ts` | Main import pipeline actions (batched parsing, reaction resolution, stats aggregation) |
| `components/import/import-progress.tsx` | Real-time progress display |

### Key Convex Patterns for Actions

Actions in Convex:
- Can call external APIs and run longer computations
- Are NOT transactional — must use `ctx.runMutation()` for writes
- Can schedule follow-up work via `ctx.scheduler.runAfter(0, ...)`
- Have a 10-minute timeout per invocation
- Use `internalAction` / `internalMutation` for functions not exposed to the client

## 3. Detailed Step-by-Step Implementation

### Step 1: Add internal mutations to importJobs.ts

**File:** `/Users/robert.sawyer/Git/messagevault/convex/importJobs.ts`

Add these internal mutations (not exposed to client):

```typescript
import { internalMutation } from "./_generated/server";

/**
 * Update import job status (internal — called by import pipeline actions).
 */
export const updateStatus = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    status: v.union(
      v.literal("uploading"),
      v.literal("parsing"),
      v.literal("embedding"),
      v.literal("completed"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.error !== undefined) patch.error = args.error;
    if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
    await ctx.db.patch(args.jobId, patch);
  },
});

/**
 * Update parsing progress counters (internal).
 */
export const updateProgress = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    parsedMessages: v.optional(v.number()),
    skippedDuplicates: v.optional(v.number()),
    embeddedMessages: v.optional(v.number()),
    totalMessages: v.optional(v.number()),
    conversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.parsedMessages !== undefined) patch.parsedMessages = args.parsedMessages;
    if (args.skippedDuplicates !== undefined) patch.skippedDuplicates = args.skippedDuplicates;
    if (args.embeddedMessages !== undefined) patch.embeddedMessages = args.embeddedMessages;
    if (args.totalMessages !== undefined) patch.totalMessages = args.totalMessages;
    if (args.conversationId !== undefined) patch.conversationId = args.conversationId;
    await ctx.db.patch(args.jobId, patch);
  },
});
```

### Step 2: Create the main import pipeline

**File:** `/Users/robert.sawyer/Git/messagevault/convex/import.ts` (new)

```typescript
// ABOUTME: Batched import pipeline — parses messages, resolves reactions, aggregates stats.
// ABOUTME: Uses scheduler chaining to process large files within Convex's 10-minute action timeout.

import { action, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { parseAppleMessages, type ParticipantMap } from "./lib/parser";

const BATCH_SIZE = 2000;

/**
 * Start the import pipeline. Called from the client after identity resolution.
 */
export const startImport = action({
  args: {
    jobId: v.id("importJobs"),
    fileContent: v.string(),
    participantMap: v.any(), // Record<string, string> — extractedName -> participantId
    conversationTitle: v.string(),
    sourceFilename: v.string(),
    isGroupChat: v.boolean(),
    participantIds: v.array(v.string()),
    metadata: v.optional(
      v.object({
        contactInfo: v.optional(v.string()),
        exportedAt: v.optional(v.string()),
        totalMessagesReported: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Verify auth
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Update job status to parsing
    await ctx.runMutation(internal.importJobs.updateStatus, {
      jobId: args.jobId,
      status: "parsing",
    });

    // Parse the entire file
    const result = parseAppleMessages(
      args.fileContent,
      args.participantMap as ParticipantMap
    );

    // Create conversation record
    const conversationId = await ctx.runMutation(
      internal.import.createConversation,
      {
        jobId: args.jobId,
        title: args.conversationTitle,
        isGroupChat: args.isGroupChat,
        participantIds: args.participantIds,
        sourceFilename: args.sourceFilename,
        metadata: args.metadata,
        totalMessages: result.messages.length,
      }
    );

    // Update job with total count
    await ctx.runMutation(internal.importJobs.updateProgress, {
      jobId: args.jobId,
      totalMessages: result.messages.length,
      conversationId: conversationId as any,
    });

    // Start batched message insertion
    if (result.messages.length > 0) {
      await ctx.scheduler.runAfter(0, internal.import.insertMessageBatch, {
        jobId: args.jobId,
        conversationId: conversationId as any,
        messages: result.messages.slice(0, BATCH_SIZE),
        remainingMessages: result.messages.slice(BATCH_SIZE),
        reactions: result.reactions,
        parsedSoFar: 0,
        skippedSoFar: 0,
      });
    } else {
      // No messages — skip to completion
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "completed",
        completedAt: Date.now(),
      });
    }
  },
});
```

### Step 3: Implement batched message insertion

```typescript
/**
 * Insert a batch of messages, then schedule the next batch.
 * After all messages are inserted, schedule reaction resolution.
 */
export const insertMessageBatch = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
    messages: v.any(), // ParsedMessage[] for current batch
    remainingMessages: v.any(), // ParsedMessage[] still to process
    reactions: v.any(), // ParsedReaction[] (carried through to final step)
    parsedSoFar: v.number(),
    skippedSoFar: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      // Insert current batch via mutation (transactional)
      const batchResult = await ctx.runMutation(
        internal.import.insertMessages,
        {
          conversationId: args.conversationId,
          messages: args.messages,
        }
      );

      const newParsed = args.parsedSoFar + batchResult.inserted;
      const newSkipped = args.skippedSoFar + batchResult.skipped;

      // Update progress
      await ctx.runMutation(internal.importJobs.updateProgress, {
        jobId: args.jobId,
        parsedMessages: newParsed,
        skippedDuplicates: newSkipped,
      });

      if (args.remainingMessages.length > 0) {
        // Schedule next batch
        await ctx.scheduler.runAfter(0, internal.import.insertMessageBatch, {
          jobId: args.jobId,
          conversationId: args.conversationId,
          messages: args.remainingMessages.slice(0, BATCH_SIZE),
          remainingMessages: args.remainingMessages.slice(BATCH_SIZE),
          reactions: args.reactions,
          parsedSoFar: newParsed,
          skippedSoFar: newSkipped,
        });
      } else {
        // All messages inserted — proceed to reaction resolution
        await ctx.scheduler.runAfter(0, internal.import.resolveReactions, {
          jobId: args.jobId,
          conversationId: args.conversationId,
          reactions: args.reactions,
        });
      }
    } catch (error) {
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error during parsing",
      });
    }
  },
});
```

### Step 4: Implement the message insertion mutation with deduplication

```typescript
/**
 * Insert a batch of messages into the database with deduplication.
 * Returns count of inserted and skipped messages.
 */
export const insertMessages = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    messages: v.any(), // ParsedMessage[]
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;

    // Get the userId from the conversation record
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const userId = conversation.userId;

    for (const msg of args.messages) {
      // Deduplication check: same conversation + timestamp + sender + content
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_timestamp", (q) =>
          q.eq("conversationId", args.conversationId).eq("timestamp", msg.timestamp)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("participantId"), msg.participantId),
            q.eq(q.field("content"), msg.content)
          )
        )
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("messages", {
        userId,
        conversationId: args.conversationId,
        participantId: msg.participantId,
        senderName: msg.senderName,
        timestamp: msg.timestamp,
        dateKey: msg.dateKey,
        content: msg.content,
        rawContent: msg.rawContent,
        messageType: msg.messageType,
        attachmentRef: msg.attachmentRef,
        hasReactions: false,
        // embedding is omitted — will be set by B5
      });
      inserted++;
    }

    return { inserted, skipped };
  },
});
```

### Step 5: Implement reaction resolution

```typescript
/**
 * After all messages are inserted, resolve reactions by matching
 * quoted text to message content. Then proceed to daily stats.
 */
export const resolveReactions = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
    reactions: v.any(), // ParsedReaction[]
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.import.insertReactions, {
        conversationId: args.conversationId,
        reactions: args.reactions,
      });

      // Proceed to daily stats aggregation
      await ctx.scheduler.runAfter(0, internal.import.aggregateDailyStats, {
        jobId: args.jobId,
        conversationId: args.conversationId,
      });
    } catch (error) {
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Reaction resolution failed",
      });
    }
  },
});

export const insertReactions = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    reactions: v.any(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return;
    const userId = conversation.userId;

    for (const reaction of args.reactions) {
      // Find the message this reaction refers to by matching quoted text
      // Search recent messages (before the reaction timestamp) whose content
      // contains or starts with the quoted text
      const candidates = await ctx.db
        .query("messages")
        .withIndex("by_conversationId_timestamp", (q) =>
          q.eq("conversationId", args.conversationId)
            .lt("timestamp", reaction.timestamp)
        )
        .order("desc")
        .take(50); // check last 50 messages

      let matchedMessageId: string | undefined;
      for (const msg of candidates) {
        // Exact or prefix match on content vs quoted text
        if (
          msg.content === reaction.quotedText ||
          msg.content.startsWith(reaction.quotedText) ||
          reaction.quotedText.startsWith(msg.content)
        ) {
          matchedMessageId = msg._id;
          // Mark the message as having reactions
          await ctx.db.patch(msg._id, { hasReactions: true });
          break;
        }
      }

      await ctx.db.insert("reactions", {
        userId,
        conversationId: args.conversationId,
        messageId: matchedMessageId as any,
        participantId: reaction.participantId,
        reactionType: reaction.reactionType,
        quotedText: reaction.quotedText,
        timestamp: reaction.timestamp,
      });
    }
  },
});
```

### Step 6: Implement daily stats aggregation

```typescript
/**
 * Aggregate message counts by date for the calendar heatmap.
 * Then finalize the conversation and transition to embedding status.
 */
export const aggregateDailyStats = internalAction({
  args: {
    jobId: v.id("importJobs"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.import.computeDailyStats, {
        conversationId: args.conversationId,
      });

      // Finalize conversation metadata
      await ctx.runMutation(internal.import.finalizeConversation, {
        conversationId: args.conversationId,
      });

      // Transition to embedding status (B5 will pick this up)
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "embedding",
      });

      // B5 will schedule embedding generation from here.
      // Wire this to internal.embeddings.startEmbedding when B5 is implemented.
      // For now, if B5 isn't implemented yet, you may optionally mark as completed instead.
    } catch (error) {
      await ctx.runMutation(internal.importJobs.updateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Stats aggregation failed",
      });
    }
  },
});

export const computeDailyStats = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return;
    const userId = conversation.userId;

    // Get all messages for this conversation, grouped by dateKey
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    // Group by dateKey
    const dateGroups = new Map<
      string,
      { participants: Map<string, number>; total: number }
    >();

    for (const msg of messages) {
      let group = dateGroups.get(msg.dateKey);
      if (!group) {
        group = { participants: new Map(), total: 0 };
        dateGroups.set(msg.dateKey, group);
      }
      group.total++;
      group.participants.set(
        msg.participantId,
        (group.participants.get(msg.participantId) ?? 0) + 1
      );
    }

    // Upsert dailyStats records
    for (const [dateKey, group] of dateGroups) {
      const existing = await ctx.db
        .query("dailyStats")
        .withIndex("by_userId_dateKey", (q) =>
          q.eq("userId", userId).eq("dateKey", dateKey)
        )
        .unique();

      const conversationBreakdown = [
        { conversationId: args.conversationId, count: group.total },
      ];
      const participantBreakdown = Array.from(group.participants.entries()).map(
        ([participantId, count]) => ({
          participantId: participantId as any,
          count,
        })
      );

      if (existing) {
        // Merge with existing stats (from other conversations on the same day)
        const mergedConvBreakdown = [...existing.conversationBreakdown];
        const existingConvIdx = mergedConvBreakdown.findIndex(
          (c) => c.conversationId === args.conversationId
        );
        if (existingConvIdx >= 0) {
          mergedConvBreakdown[existingConvIdx] = conversationBreakdown[0]!;
        } else {
          mergedConvBreakdown.push(conversationBreakdown[0]!);
        }

        const mergedParticipantBreakdown = [...existing.participantBreakdown];
        for (const pb of participantBreakdown) {
          const existingIdx = mergedParticipantBreakdown.findIndex(
            (p) => p.participantId === pb.participantId
          );
          if (existingIdx >= 0) {
            mergedParticipantBreakdown[existingIdx] = {
              ...mergedParticipantBreakdown[existingIdx]!,
              count: mergedParticipantBreakdown[existingIdx]!.count + pb.count,
            };
          } else {
            mergedParticipantBreakdown.push(pb);
          }
        }

        await ctx.db.patch(existing._id, {
          totalMessages: existing.totalMessages + group.total,
          conversationBreakdown: mergedConvBreakdown,
          participantBreakdown: mergedParticipantBreakdown,
        });
      } else {
        await ctx.db.insert("dailyStats", {
          userId,
          dateKey,
          totalMessages: group.total,
          conversationBreakdown,
          participantBreakdown,
        });
      }
    }
  },
});

/**
 * Finalize conversation metadata after all messages are inserted.
 */
export const finalizeConversation = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    if (messages.length === 0) return;

    const timestamps = messages.map((m) => m.timestamp);
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);

    await ctx.db.patch(args.conversationId, {
      dateRange: { start, end },
      messageCount: messages.length,
    });

    // Update participant message counts
    const participantCounts = new Map<string, number>();
    for (const msg of messages) {
      participantCounts.set(
        msg.participantId,
        (participantCounts.get(msg.participantId) ?? 0) + 1
      );
    }

    for (const [participantId, count] of participantCounts) {
      const participant = await ctx.db.get(participantId as any);
      if (participant) {
        await ctx.db.patch(participantId as any, {
          messageCount: participant.messageCount + count,
          conversationCount: participant.conversationCount + 1,
        });
      }
    }
  },
});

/**
 * Create conversation record (internal mutation).
 */
export const createConversation = internalMutation({
  args: {
    jobId: v.id("importJobs"),
    title: v.string(),
    isGroupChat: v.boolean(),
    participantIds: v.array(v.string()),
    sourceFilename: v.string(),
    metadata: v.optional(v.any()),
    totalMessages: v.number(),
  },
  handler: async (ctx, args) => {
    // Get userId from the import job
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Import job not found");

    const conversationId = await ctx.db.insert("conversations", {
      userId: job.userId,
      title: args.title,
      isGroupChat: args.isGroupChat,
      participantIds: args.participantIds as any,
      dateRange: { start: 0, end: 0 }, // will be finalized after parsing
      messageCount: 0, // will be finalized after parsing
      importedAt: Date.now(),
      sourceFilename: args.sourceFilename,
      metadata: args.metadata,
    });

    return conversationId;
  },
});
```

### Step 7: Create the import progress component

**File:** `/Users/robert.sawyer/Git/messagevault/components/import/import-progress.tsx` (new)

```typescript
// ABOUTME: Real-time import progress display with reactive Convex queries.
// ABOUTME: Shows parsing progress bar, status text, duplicate count, and completion actions.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

interface ImportProgressProps {
  jobId: Id<"importJobs">;
  onNewImport: () => void;
}

export function ImportProgress({ jobId, onNewImport }: ImportProgressProps) {
  const job = useQuery(api.importJobs.get, { jobId });

  if (!job) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const progress =
    job.totalMessages > 0
      ? Math.round((job.parsedMessages / job.totalMessages) * 100)
      : 0;

  const isComplete = job.status === "completed";
  const isFailed = job.status === "failed";
  const isParsing = job.status === "parsing";
  const isEmbedding = job.status === "embedding";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {isComplete && <CheckCircle className="h-5 w-5 text-emerald-400" />}
          {isFailed && <AlertCircle className="h-5 w-5 text-destructive" />}
          {(isParsing || isEmbedding) && (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
          {job.sourceFilename}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="capitalize text-muted-foreground">{job.status}...</span>
            <span className="text-muted-foreground">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="text-sm text-muted-foreground">
          {job.parsedMessages.toLocaleString()} of{" "}
          {job.totalMessages.toLocaleString()} messages parsed
          {job.skippedDuplicates > 0 && (
            <span> ({job.skippedDuplicates.toLocaleString()} duplicates skipped)</span>
          )}
        </div>

        {isEmbedding && (
          <div className="text-sm text-muted-foreground">
            Generating embeddings: {job.embeddedMessages.toLocaleString()} of{" "}
            {job.totalMessages.toLocaleString()}
            <p className="mt-1 text-xs">
              You can browse messages now — embeddings generate in the background.
            </p>
          </div>
        )}

        {/* Error display */}
        {isFailed && job.error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {job.error}
          </div>
        )}

        {/* Completion actions */}
        {(isComplete || isEmbedding) && job.conversationId && (
          <div className="flex gap-2 pt-2">
            <Button asChild>
              <Link href={`/browse/${job.conversationId}`}>
                Browse Conversation
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" onClick={onNewImport}>
              Import Another
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### Step 8: Wire progress UI into the import page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx`

Update the import page to:
1. In the `step === "parsing"` branch, render `<ImportProgress jobId={jobId} onNewImport={handleCancel} />`
2. After identity resolution completes, call the `startImport` action with all required args
3. Transition to the "parsing" step to show progress

Add these imports and state:
```typescript
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ImportProgress } from "@/components/import/import-progress";

// In the component:
const startImportAction = useAction(api.import.startImport);
const [participantMap, setParticipantMap] = useState<Record<string, string> | null>(null);

async function handleIdentityResolved(participantMap: Record<string, string>) {
  setParticipantMap(participantMap);
  setStep("parsing");

  if (!jobId || !scannedHeader) return;

  try {
    await startImportAction({
      jobId,
      fileContent,
      participantMap,
      conversationTitle: scannedHeader.title,
      sourceFilename: fileName,
      isGroupChat: scannedHeader.participantNames.length > 2,
      participantIds: Object.values(participantMap),
      metadata: {
        contactInfo: scannedHeader.contactInfo ?? undefined,
        exportedAt: scannedHeader.exportedAt ?? undefined,
        totalMessagesReported: scannedHeader.totalMessagesReported ?? undefined,
      },
    });
  } catch (err) {
    console.error("Failed to start import:", err);
  }
}
```

## 4. Testing Strategy

1. Import a small test file (100 messages) — verify all messages inserted, stats computed
2. Import a large file (15K+ messages) — verify batching works without timeout
3. Re-import the same file — verify all messages skipped as duplicates
4. Import overlapping file — verify only new messages inserted
5. Verify reactions are linked to correct messages
6. Verify dailyStats records created with correct counts
7. Verify conversation metadata (dateRange, messageCount) is correct
8. Monitor Convex dashboard for scheduled function execution

## 5. Validation Checklist

- [ ] Messages insert in batches of ~2,000
- [ ] Scheduler chaining continues until all messages processed
- [ ] Duplicate messages skipped with counter
- [ ] Reactions resolved to target messages
- [ ] `hasReactions` flag set on reacted-to messages
- [ ] Daily stats aggregated correctly
- [ ] Conversation metadata finalized (dateRange, messageCount)
- [ ] Participant counts updated
- [ ] Import job status transitions correctly
- [ ] Progress visible in real-time via reactive query
- [ ] Error handling catches and records failures
- [ ] No TypeScript errors

## 6. Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| Action argument size limit — passing full `remainingMessages` array | If the serialized remaining messages exceed Convex's argument limit, switch to storing the parsed data temporarily and reading it in each batch. Alternatively, parse in the batch action itself instead of parsing all up front. |
| Mutation write limits — 2,000 messages per mutation may hit limits | Convex mutations can handle thousands of writes. If issues arise, reduce batch size to 500-1,000. |
| Reaction resolution — quoted text may be truncated | Use prefix matching as implemented. Could also try fuzzy substring matching if exact/prefix fails. |
| Large file takes too long — 10-minute timeout per action | Each batch is a separate action invocation via scheduler. The 10-minute limit applies per batch, not total. 2,000 messages should process well within this. |
| `v.any()` type usage | Used for complex nested types that are hard to express with Convex validators. The executor may want to define proper validator schemas for better type safety. |

## 7. Assumptions & Dependencies

- **B1-B3 are complete** — file upload, identity resolution, parser
- **Convex scheduler** works as documented (`ctx.scheduler.runAfter(0, ...)` yields and re-invokes)
- **`internal` API** — Convex `internal.*` references work for internal actions/mutations
- **Convex argument size** — the full parsed message array fits in scheduler arguments. If not, the executor must refactor to parse incrementally.
