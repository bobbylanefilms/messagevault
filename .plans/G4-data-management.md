# Handoff Plan: G4 — Data Management

## 1. Problem Summary

Build data management tools in the Settings page: import history table, delete conversations with full cascading delete, and storage usage display.

**Why:** Users need visibility into their imports and the ability to clean up data. A conversation imported with errors should be deletable and re-importable. Storage usage helps users understand their archive size.

**Success Criteria:**
- Import history table showing all imports with date, filename, message count, status, and duration
- Delete conversation with confirmation dialog and full cascading delete (messages, reactions, dailyStats updates, participant count updates)
- Storage usage display: total messages, conversations, embeddings, daily stats entries, chat sessions
- Deletion progress indicator for large conversations
- Success/error feedback via toast

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/convex/importJobs.ts` — Has `create`, `get`, `list`, `updateStatus`, and `updateProgress`. The `list` query returns all import jobs for the user sorted by descending order. Ready to use for import history.
- `/Users/robert.sawyer/Git/messagevault/convex/conversations.ts` — Has `list` (all conversations with participant names) and `get` (single conversation). No delete functionality exists.
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts`:
  - `importJobs` table (lines 171-192): status, sourceFilename, parsedMessages, skippedDuplicates, embeddedMessages, totalMessages, error, startedAt, completedAt, conversationId
  - `conversations` table (lines 20-41): with `by_userId` index
  - `messages` table (lines 59-91): with `by_conversationId_timestamp` index for loading conversation messages
  - `reactions` table (lines 93-110): with `by_conversationId` index for loading conversation reactions
  - `dailyStats` table (lines 112-128): with `by_userId_dateKey` index, has `conversationBreakdown` array
- `/Users/robert.sawyer/Git/messagevault/convex/dashboard.ts` — Created in G1 with `stats` and `recentMessages` queries. Needs `storageStats` query added.
- `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx` — After G2, has Tabs with "Data" tab showing EmptyState placeholder.
- `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` — `formatRelativeTimestamp()`, `formatDateRange()` for date formatting.

### Import Pipeline Pattern (for batched deletion)

The import pipeline (`convex/lib/importer.ts`) uses a pattern of action → batched internal mutations for handling large datasets within Convex's time limits. The conversation delete operation should follow this same pattern:
- **Action** orchestrates the delete (10-minute timeout)
- **Internal mutations** handle batched work (delete messages in groups, update stats)
- The action calls internal mutations via `ctx.runMutation()`

### ImportJobs Schema Details

From schema.ts lines 171-192:
```typescript
importJobs: {
  userId: v.id("users"),
  status: "uploading" | "parsing" | "embedding" | "completed" | "failed",
  conversationId: v.optional(v.id("conversations")),
  sourceFilename: v.string(),
  totalLines: v.optional(v.number()),
  parsedMessages: v.number(),
  skippedDuplicates: v.number(),
  embeddedMessages: v.number(),
  totalMessages: v.number(),
  error: v.optional(v.string()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
}
```

## 3. Detailed Step-by-Step Implementation

### Step 1: Create `convex/dataManagement.ts` — Cascading Delete

**File:** `/Users/robert.sawyer/Git/messagevault/convex/dataManagement.ts` (new file)

This file contains the cascading conversation deletion logic using the action + internal mutation pattern.

```typescript
// ABOUTME: Data management operations — cascading conversation deletion with batched mutations.
// ABOUTME: Uses the action pattern to handle large conversations within Convex time limits.

import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * Internal query to get conversation details with ownership validation.
 */
export const getConversationForDeletion = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== user._id) {
      throw new Error("Conversation not found or access denied");
    }

    return {
      ...conversation,
      userId: user._id,
    };
  },
});

/**
 * Internal query to get all message IDs for a conversation (for batched deletion).
 */
export const getMessageIdsForConversation = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    return messages.map((m) => ({ _id: m._id, participantId: m.participantId }));
  },
});

/**
 * Delete a batch of messages by their IDs.
 */
export const deleteMessageBatch = internalMutation({
  args: {
    messageIds: v.array(v.id("messages")),
  },
  handler: async (ctx, args) => {
    for (const id of args.messageIds) {
      await ctx.db.delete(id);
    }
  },
});

/**
 * Delete all reactions for a conversation.
 */
export const deleteReactions = internalMutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    for (const r of reactions) {
      await ctx.db.delete(r._id);
    }
  },
});

/**
 * Update dailyStats after conversation deletion:
 * subtract the conversation's contribution from each day's stats.
 * Delete the dailyStats record entirely if it drops to 0 messages.
 */
export const updateDailyStatsForDeletion = internalMutation({
  args: {
    userId: v.id("users"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const allStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) =>
        q.eq("userId", args.userId)
      )
      .collect();

    for (const stat of allStats) {
      const convEntry = stat.conversationBreakdown.find(
        (cb) => cb.conversationId === args.conversationId
      );
      if (convEntry) {
        const newTotal = stat.totalMessages - convEntry.count;
        const newConvBreakdown = stat.conversationBreakdown.filter(
          (cb) => cb.conversationId !== args.conversationId
        );

        if (newTotal <= 0) {
          // No messages left for this day — delete the stats record
          await ctx.db.delete(stat._id);
        } else {
          await ctx.db.patch(stat._id, {
            totalMessages: newTotal,
            conversationBreakdown: newConvBreakdown,
          });
        }
      }
    }
  },
});

/**
 * Update participant message counts and conversation counts after deletion.
 */
export const updateParticipantCountsForDeletion = internalMutation({
  args: {
    messageCounts: v.array(
      v.object({
        participantId: v.id("participants"),
        count: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const { participantId, count } of args.messageCounts) {
      const participant = await ctx.db.get(participantId);
      if (participant) {
        await ctx.db.patch(participantId, {
          messageCount: Math.max(0, participant.messageCount - count),
          conversationCount: Math.max(0, participant.conversationCount - 1),
        });
      }
    }
  },
});

/**
 * Delete the conversation record and associated import job.
 */
export const deleteConversationRecord = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Delete associated import job(s)
    const importJobs = await ctx.db
      .query("importJobs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    for (const job of importJobs) {
      if (job.conversationId === args.conversationId) {
        await ctx.db.delete(job._id);
      }
    }

    // Delete the conversation record
    await ctx.db.delete(args.conversationId);
  },
});

/**
 * Main action: orchestrates the cascading conversation delete.
 * Uses internal mutations for each step to stay within Convex limits.
 */
export const deleteConversation = action({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // 1. Validate ownership
    const conversation = await ctx.runQuery(
      internal.dataManagement.getConversationForDeletion,
      { conversationId: args.conversationId, clerkId: identity.subject }
    );

    // 2. Get all message IDs and compute per-participant counts
    const messageInfo = await ctx.runQuery(
      internal.dataManagement.getMessageIdsForConversation,
      { conversationId: args.conversationId }
    );

    // Compute per-participant message counts for updating participant records
    const participantCountMap = new Map<string, number>();
    for (const msg of messageInfo) {
      const current = participantCountMap.get(msg.participantId) ?? 0;
      participantCountMap.set(msg.participantId, current + 1);
    }

    // 3. Delete reactions
    await ctx.runMutation(internal.dataManagement.deleteReactions, {
      conversationId: args.conversationId,
    });

    // 4. Delete messages in batches of 500
    const BATCH_SIZE = 500;
    const messageIds = messageInfo.map((m) => m._id);
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);
      await ctx.runMutation(internal.dataManagement.deleteMessageBatch, {
        messageIds: batch,
      });
    }

    // 5. Update dailyStats
    await ctx.runMutation(internal.dataManagement.updateDailyStatsForDeletion, {
      userId: conversation.userId,
      conversationId: args.conversationId,
    });

    // 6. Update participant counts
    const messageCounts = Array.from(participantCountMap.entries()).map(
      ([participantId, count]) => ({
        participantId: participantId as any,
        count,
      })
    );
    await ctx.runMutation(
      internal.dataManagement.updateParticipantCountsForDeletion,
      { messageCounts }
    );

    // 7. Delete conversation record and import job
    await ctx.runMutation(internal.dataManagement.deleteConversationRecord, {
      conversationId: args.conversationId,
      userId: conversation.userId,
    });

    return { deletedMessages: messageIds.length };
  },
});
```

**Why:** Conversation deletion must cascade across 5 related data stores: messages, reactions, dailyStats, participants, and importJobs. Using an action (10-minute timeout) with batched internal mutations ensures large conversations (15K+ messages) can be deleted without hitting Convex mutation time limits.

**Edge cases:**
- Empty conversation (0 messages): all steps still run safely, deleting only the conversation record
- dailyStats with only this conversation's data: records are deleted entirely (not left with totalMessages: 0)
- Import job may not exist (if conversation was created before import tracking): filter safely
- Concurrent reads during deletion: Convex reactivity handles this — queries re-run automatically

**Verify:** Delete a conversation → verify messages table has no records for that conversationId. Verify dailyStats updated. Verify participant counts decremented.

### Step 2: Add Storage Stats Query to `convex/dashboard.ts`

**File:** `/Users/robert.sawyer/Git/messagevault/convex/dashboard.ts`

**Changes:** Add `storageStats` query after existing `recentMessages`.

```typescript
/**
 * Storage usage stats for the data management view.
 */
export const storageStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    const totalMessages = conversations.reduce(
      (sum, c) => sum + c.messageCount,
      0
    );

    // Estimate embeddings from completed import jobs
    const importJobs = await ctx.db
      .query("importJobs")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();
    const totalEmbeddings = importJobs
      .filter((j) => j.status === "completed")
      .reduce((sum, j) => sum + j.embeddedMessages, 0);

    const dailyStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) => q.eq("userId", userId as any))
      .collect();

    const chatSessions = await ctx.db
      .query("chatSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    return {
      totalMessages,
      totalConversations: conversations.length,
      totalEmbeddings,
      totalDailyStats: dailyStats.length,
      totalChatSessions: chatSessions.length,
    };
  },
});
```

**Why:** Storage stats give users visibility into their data footprint. Embeddings count is estimated from import jobs (counting all messages individually would be too expensive).

**Verify:** Query returns accurate counts matching database state.

### Step 3: Create Import History Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/import-history.tsx` (new file)

```typescript
// ABOUTME: Import history table — shows all past imports with status, file info, and counts.
// ABOUTME: Read-only view of importJobs for transparency into data lineage.
```

The component should:
- Use `useQuery(api.importJobs.list)` to fetch all import jobs
- Render inside a `Card` with "Import History" header and "Import" action button linking to `/import`
- Table columns: Date (relative via `formatRelativeTimestamp`), Filename, Messages (parsedMessages - skippedDuplicates), Skipped, Status, Duration
- Status display:
  - `completed`: green `Badge` "Complete"
  - `failed`: red `Badge` "Failed" — hover or click shows error message in a Tooltip
  - `parsing`/`embedding`/`uploading`: yellow animated `Badge` "In Progress"
- Duration: computed from `completedAt - startedAt` as "Xm Ys" or "< 1m"
- Empty state: "No imports yet" with link to `/import`
- Show loading skeleton while data loads

**Design notes:**
- Table with `text-sm` for compact display
- Filename truncated with `truncate max-w-[200px]`
- Right-align numeric columns (Messages, Skipped)
- Sort by date descending (already sorted from query)

**Verify:** All past imports visible with correct data. Status badges match job status. Duration calculation is correct.

### Step 4: Create Conversation Manager Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/conversation-manager.tsx` (new file)

```typescript
// ABOUTME: Conversation manager — lists all conversations with delete action.
// ABOUTME: Part of the Data Management settings tab.
```

The component should:
- Use `useQuery(api.conversations.list)` to fetch all conversations
- Render inside a `Card` with "Conversations" header
- Each row: conversation title, participant names (comma-separated), message count, date range, delete button
- Delete button: `Trash2` icon with `variant="ghost"` and `text-destructive` color
- Clicking delete opens `DeleteConversationDialog`
- Show loading skeleton while data loads

**Design notes:**
- Compact rows with good alignment
- Participant names in `text-muted-foreground`
- Message count right-aligned with `tabular-nums`
- Date range formatted via `formatDateRange()`

**Verify:** All conversations listed. Delete button opens confirmation dialog.

### Step 5: Create Delete Conversation Dialog

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/delete-conversation-dialog.tsx` (new file)

```typescript
// ABOUTME: Delete conversation confirmation dialog with cascading delete action.
// ABOUTME: Warns about irreversibility and shows conversation details before deletion.
```

The dialog should:
- Accept `conversation` object (title, messageCount, _id) and open/close state
- Show conversation title and message count in the warning
- Warning text: `This will permanently delete "{title}" and all {messageCount} messages, reactions, and associated data. This action cannot be undone.`
- Cancel and "Delete Conversation" buttons (Delete uses `variant="destructive"`)
- Loading state on Delete button while action runs (call `api.dataManagement.deleteConversation`)
- Success toast: `"Deleted {title} ({N} messages)"`
- Error toast on failure
- Close dialog on success

**Design notes:**
- Dialog title: "Delete Conversation"
- Red/destructive warning icon at top
- Bold conversation title in warning text
- Delete button: full red background, white text

**Verify:** Dialog shows correct conversation info. Delete action completes. Toast appears. Dialog closes.

### Step 6: Create Storage Usage Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/storage-usage.tsx` (new file)

```typescript
// ABOUTME: Storage usage display — shows archive data footprint at a glance.
// ABOUTME: Counts messages, conversations, embeddings, daily stats, and chat sessions.
```

The component should:
- Use `useQuery(api.dashboard.storageStats)` to fetch counts
- Render inside a `Card` with "Storage Usage" header
- Grid of stat items (2×3 or responsive):
  - Messages: `MessageSquare` icon + count
  - Conversations: `MessagesSquare` icon + count
  - Embeddings: `Brain` icon + count
  - Daily Stats: `CalendarDays` icon + count
  - Chat Sessions: `Bot` icon + count
- Each item: icon (muted) + label (muted) + count (bold, large)
- Show loading skeleton while data loads

**Design notes:**
- `grid grid-cols-2 sm:grid-cols-3 gap-4` layout
- Each stat: column layout with icon on left, label + number stacked
- Numbers use `toLocaleString()` for comma formatting

**Verify:** Stats match database reality. Numbers update after deletions.

### Step 7: Wire into Settings Page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx`

**Changes:** Replace the Data tab EmptyState with the three data management components.

```typescript
import { ImportHistory } from "@/components/settings/import-history";
import { ConversationManager } from "@/components/settings/conversation-manager";
import { StorageUsage } from "@/components/settings/storage-usage";

// In the Data TabsContent:
<TabsContent value="data" className="mt-6 space-y-6">
  <ImportHistory />
  <ConversationManager />
  <StorageUsage />
</TabsContent>
```

**Verify:** Navigate to Settings → Data tab. All three sections render. Import history shows past imports. Conversation list has delete buttons. Storage stats are accurate.

## 4. Testing Strategy

- **Import history:** Navigate to Settings → Data. Verify all past imports shown with correct filenames, message counts, statuses, and durations.
- **Delete conversation (small):** Delete a small conversation (< 100 messages). Verify:
  - Messages removed (check browse view — conversation gone)
  - Reactions removed
  - DailyStats updated (message counts for those days decreased)
  - Participant counts decremented
  - Import job deleted
  - Storage stats updated
- **Delete conversation (cancel):** Open delete dialog → cancel → verify nothing changed
- **Delete conversation (large):** If available, delete a large conversation (1K+ messages). Verify loading state appears and operation completes.
- **Storage stats:** Verify counts match actual database records. Delete a conversation → verify stats update.
- **Type check:** Run `pnpm build` to verify no TypeScript errors.

## 5. Validation Checklist

- [ ] Import history shows all imports with date, filename, message count, skipped count, status
- [ ] Import history status badges: green for completed, red for failed, yellow for in-progress
- [ ] Failed imports show error message
- [ ] Conversation list shows all conversations with title, participants, message count, date range
- [ ] Delete dialog shows correct conversation title and message count
- [ ] Delete dialog warning text mentions irreversibility
- [ ] Cascade delete removes: messages, reactions, dailyStats contributions, import job
- [ ] Cascade delete updates: participant message/conversation counts
- [ ] Loading state shown on delete button during deletion
- [ ] Success toast after deletion with conversation name and message count
- [ ] Storage stats show correct totals for messages, conversations, embeddings, daily stats, chat sessions
- [ ] Storage stats update reactively after deletion
- [ ] Empty states shown when no imports or conversations exist
- [ ] No TypeScript errors (`pnpm build`)

## 6. Potential Issues & Mitigations

- **Large conversation delete timing:** A 15K message conversation requires deleting messages in batches of 500, so ~30 batch mutations. Each batch takes ~1-2 seconds. Total: ~30-60 seconds. The action has a 10-minute timeout, so this is well within limits. The UI should show a loading state during this time.
- **dailyStats update complexity:** The `updateDailyStatsForDeletion` mutation iterates ALL dailyStats for the user. For users with 2+ years of daily data (~730 records), this is still fast. If needed, optimize by only querying dateKeys that appear in the conversation's messages.
- **Orphaned embeddings:** Deleting messages also removes their embedding vectors. The vector index automatically updates. No separate cleanup needed.
- **Concurrent deletion:** If two deletes run simultaneously, they may conflict on participant count updates. Convex's OCC (optimistic concurrency control) will retry the conflicting mutation. The UI should be fine — just slower.
- **Import job association:** Import jobs may not have `conversationId` set if the import was an older version. The deletion logic filters by `conversationId` match and handles undefined gracefully.

## 7. Assumptions & Dependencies

- **G2 complete** — Settings page has Tabs structure with "Data" tab placeholder
- **G1 complete** — `convex/dashboard.ts` exists and can receive `storageStats` query
- **`importJobs.list` query** returns all import jobs sorted descending (confirmed)
- **`conversations.list` query** returns enriched conversations with participant names (confirmed)
- **Messages `by_conversationId_timestamp` index** exists for loading conversation messages (confirmed)
- **Reactions `by_conversationId` index** exists for loading conversation reactions (confirmed)
- **Sonner toast** installed by G2 (for success/error feedback)
- **Convex action pattern** available — uses `ctx.runMutation()` and `ctx.runQuery()` with `internal` API (confirmed — used by import pipeline)
- **No new shadcn/ui components needed** — Dialog, Badge, Button, Card all installed
