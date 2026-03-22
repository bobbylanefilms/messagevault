# Handoff Plan: G3 — Participant Management

## 1. Problem Summary

Build the participant manager in the Settings page: view all participants across conversations, edit display names inline, change bubble colors, merge duplicates, and delete participants with no messages.

**Why:** After importing multiple conversations, the same person may appear with different names ("Mom" in one chat, "Lisa" in another). The participant manager lets users clean up their data by merging duplicates, correcting names, and customizing colors. This directly improves the browse and search experience.

**Success Criteria:**
- Sortable table listing all participants with name, aliases, conversation count, message count, and color
- Inline display name editing (click to edit, Enter to save, Escape to cancel)
- Color picker showing the 12-color palette from globals.css
- Merge flow: select 2+ participants via checkboxes → click "Merge" → dialog to choose canonical name → confirm
- Delete participant (only allowed when `messageCount === 0`)
- All changes reflect immediately in the browse view via Convex reactivity

## 2. Current State Analysis

### Relevant Files

- `/Users/robert.sawyer/Git/messagevault/convex/participants.ts` — Has `list` (all participants for user), `search` (text search), `findByName` (exact match), and `resolveForImport` (batch create/link during import). Needs `update`, `merge`, and `remove` mutations added.
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — Participants table (lines 43-57): `userId`, `displayName`, `aliases` (array), `isMe` (boolean), `avatarColor` (string), `conversationCount`, `messageCount`. Indexes: `by_userId`, `by_userId_displayName`.
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — Messages table has `by_participantId` index (line 82) for reassigning messages during merge.
- `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` — Reactions table has `by_conversationId` index but NO `by_participantId` index.
- `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx` — After G2, this has a Tabs structure with "Participants" tab showing an EmptyState placeholder. This tab's content will be replaced.
- `/Users/robert.sawyer/Git/messagevault/app/globals.css` — 12 participant colors defined as CSS custom properties: `--color-participant-0` through `--color-participant-11` (lines 47-58).
- `/Users/robert.sawyer/Git/messagevault/components/ui/checkbox.tsx` — Available for merge selection.
- `/Users/robert.sawyer/Git/messagevault/components/ui/dialog.tsx` — Available for merge confirmation.
- `/Users/robert.sawyer/Git/messagevault/components/ui/popover.tsx` — Available for color picker popover.

### Participant Color Values

From `globals.css`, the 12 colors using oklch:
```css
--color-participant-0: oklch(0.60 0.16 25);    /* warm red */
--color-participant-1: oklch(0.65 0.16 55);    /* orange */
--color-participant-2: oklch(0.62 0.16 85);    /* yellow-green */
--color-participant-3: oklch(0.65 0.14 145);   /* green */
--color-participant-4: oklch(0.62 0.12 175);   /* teal */
--color-participant-5: oklch(0.60 0.12 200);   /* cyan */
--color-participant-6: oklch(0.55 0.16 275);   /* blue */
--color-participant-7: oklch(0.58 0.18 310);   /* purple */
--color-participant-8: oklch(0.60 0.18 340);   /* pink */
--color-participant-9: oklch(0.62 0.16 10);    /* rose */
--color-participant-10: oklch(0.58 0.14 120);  /* lime */
--color-participant-11: oklch(0.55 0.14 240);  /* indigo */
```

The `avatarColor` field on participants stores the CSS variable name (e.g., `"var(--color-participant-3)"`). The color picker must use these same values.

### Existing Patterns

- Inline editing: not used elsewhere in the app. Implement with a controlled `Input` that replaces the text on click, saves on Enter, cancels on Escape.
- Convex reactivity: any mutation to participants/messages automatically triggers re-renders in browse views. No manual cache invalidation needed.

## 3. Detailed Step-by-Step Implementation

### Step 1: Add `update` Mutation to `convex/participants.ts`

**File:** `/Users/robert.sawyer/Git/messagevault/convex/participants.ts`

**Changes:** Add after existing `resolveForImport` mutation.

```typescript
/**
 * Update a participant's display name and/or avatar color.
 * Also updates senderName on all messages if displayName changes.
 */
export const update = mutation({
  args: {
    participantId: v.id("participants"),
    displayName: v.optional(v.string()),
    avatarColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const participant = await ctx.db.get(args.participantId);
    if (!participant || participant.userId !== (userId as any)) {
      throw new Error("Participant not found");
    }

    const patch: Record<string, unknown> = {};
    if (args.displayName !== undefined) {
      patch.displayName = args.displayName;

      // Update senderName on all messages from this participant
      if (args.displayName !== participant.displayName) {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_participantId", (q) => q.eq("participantId", args.participantId))
          .collect();

        for (const msg of messages) {
          await ctx.db.patch(msg._id, { senderName: args.displayName });
        }
      }
    }
    if (args.avatarColor !== undefined) {
      patch.avatarColor = args.avatarColor;
    }

    await ctx.db.patch(args.participantId, patch);
  },
});
```

**Why:** When a display name changes, we must also update the denormalized `senderName` field on all messages. Otherwise, browse view would show stale sender names.

**Edge cases:**
- Participant with 10K+ messages: the name update loop may be slow. For v1 this is acceptable since name changes are rare. If needed, convert to an action with batched mutations.
- Color change doesn't cascade — it's read directly from the participant record on display.

**Verify:** Edit a participant name → check that messages in browse view show the updated sender name.

### Step 2: Add `merge` Mutation to `convex/participants.ts`

**File:** `/Users/robert.sawyer/Git/messagevault/convex/participants.ts`

**Changes:** Add the merge mutation. This is the most complex mutation in the app.

```typescript
/**
 * Merge multiple participants into a single canonical participant.
 * Cascades updates to messages, conversations, dailyStats, and reactions.
 */
export const merge = mutation({
  args: {
    sourceIds: v.array(v.id("participants")),
    targetId: v.id("participants"),
    newDisplayName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    // Validate target
    const target = await ctx.db.get(args.targetId);
    if (!target || target.userId !== (userId as any)) {
      throw new Error("Target participant not found");
    }

    // Validate and collect sources (excluding target if included)
    const sources = [];
    for (const sid of args.sourceIds) {
      if (sid === args.targetId) continue;
      const source = await ctx.db.get(sid);
      if (!source || source.userId !== (userId as any)) {
        throw new Error(`Source participant ${sid} not found`);
      }
      sources.push(source);
    }

    if (sources.length === 0) {
      throw new Error("No source participants to merge");
    }

    const sourceIdSet = new Set(sources.map((s) => s._id));

    // 1. Collect all aliases
    const allAliases = new Set(target.aliases);
    allAliases.add(target.displayName);
    for (const source of sources) {
      allAliases.add(source.displayName);
      for (const alias of source.aliases) {
        allAliases.add(alias);
      }
    }
    allAliases.delete(args.newDisplayName);

    // 2. Reassign messages from source participants to target
    for (const source of sources) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_participantId", (q) => q.eq("participantId", source._id))
        .collect();

      for (const msg of messages) {
        await ctx.db.patch(msg._id, {
          participantId: args.targetId,
          senderName: args.newDisplayName,
        });
      }
    }

    // 3. Update conversations: replace source IDs with target in participantIds
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    for (const conv of conversations) {
      const hasSource = conv.participantIds.some((pid) => sourceIdSet.has(pid));
      if (hasSource) {
        const newPids = conv.participantIds
          .map((pid) => (sourceIdSet.has(pid) ? args.targetId : pid))
          .filter((pid, idx, arr) => arr.indexOf(pid) === idx); // deduplicate
        await ctx.db.patch(conv._id, { participantIds: newPids });
      }
    }

    // 4. Update dailyStats: merge participantBreakdown entries
    const allStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_userId_dateKey", (q) => q.eq("userId", userId as any))
      .collect();

    for (const stat of allStats) {
      const hasSource = stat.participantBreakdown.some((pb) =>
        sourceIdSet.has(pb.participantId)
      );
      if (hasSource) {
        const merged = new Map<string, number>();
        for (const pb of stat.participantBreakdown) {
          const effectiveId = sourceIdSet.has(pb.participantId)
            ? args.targetId
            : pb.participantId;
          merged.set(effectiveId, (merged.get(effectiveId) ?? 0) + pb.count);
        }
        await ctx.db.patch(stat._id, {
          participantBreakdown: Array.from(merged.entries()).map(
            ([participantId, count]) => ({
              participantId: participantId as any,
              count,
            })
          ),
        });
      }
    }

    // 5. Sum message counts and recalculate conversation count
    let totalMergedMessages = target.messageCount;
    for (const source of sources) {
      totalMergedMessages += source.messageCount;
    }

    const targetConversationCount = conversations.filter((conv) =>
      conv.participantIds.includes(args.targetId) ||
      conv.participantIds.some((pid) => sourceIdSet.has(pid))
    ).length;

    // 6. Update target participant record
    await ctx.db.patch(args.targetId, {
      displayName: args.newDisplayName,
      aliases: Array.from(allAliases),
      messageCount: totalMergedMessages,
      conversationCount: targetConversationCount,
      isMe: target.isMe || sources.some((s) => s.isMe),
    });

    // 7. Delete source participant records
    for (const source of sources) {
      await ctx.db.delete(source._id);
    }
  },
});
```

**Why:** Participant merge is the core feature of the participant manager. It must cascade correctly across messages (reassign `participantId` and `senderName`), conversations (`participantIds` arrays), and dailyStats (`participantBreakdown` arrays). Source records are deleted after merge.

**Edge cases:**
- Target included in sourceIds: filtered out (line `if (sid === args.targetId) continue`)
- `isMe` inheritance: if any source has `isMe === true`, the target gets it too
- Duplicate participantIds in conversations: deduplication via `filter` after replacement
- Large merge (10K+ messages): may approach Convex mutation time limit. If this happens during testing, refactor to an action with batched internal mutations. Start with mutation for simplicity.

**Verify:** Merge two participants → verify:
1. Messages show new sender name
2. Source participant disappears from list
3. Target participant has combined message count
4. Aliases include both original names
5. Conversations have deduplicated participantIds

### Step 3: Add `remove` Mutation to `convex/participants.ts`

**File:** `/Users/robert.sawyer/Git/messagevault/convex/participants.ts`

```typescript
/**
 * Delete a participant with no messages. Blocks deletion if messages exist.
 */
export const remove = mutation({
  args: { participantId: v.id("participants") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const participant = await ctx.db.get(args.participantId);
    if (!participant || participant.userId !== (userId as any)) {
      throw new Error("Participant not found");
    }
    if (participant.messageCount > 0) {
      throw new Error("Cannot delete a participant who has messages. Use merge instead.");
    }

    // Remove from conversation participantIds arrays
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();

    for (const conv of conversations) {
      if (conv.participantIds.includes(args.participantId)) {
        await ctx.db.patch(conv._id, {
          participantIds: conv.participantIds.filter(
            (pid) => pid !== args.participantId
          ),
        });
      }
    }

    await ctx.db.delete(args.participantId);
  },
});
```

**Why:** Deleting participants with messages would orphan those messages. The guard ensures users must merge instead.

**Verify:** Try deleting a participant with messages → verify error. Delete a participant with 0 messages → verify removed.

### Step 4: Create Color Picker Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/color-picker.tsx` (new file)

```typescript
// ABOUTME: Participant color picker — shows the 12-color palette for bubble color selection.
// ABOUTME: Used in the participant management table for changing avatar colors.

"use client";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PARTICIPANT_COLORS = Array.from({ length: 12 }, (_, i) => `var(--color-participant-${i})`);

interface ColorPickerProps {
  currentColor: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ currentColor, onSelect }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-6 w-6 rounded-full ring-1 ring-border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: currentColor }}
          aria-label="Change color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-6 gap-2">
          {PARTICIPANT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onSelect(color)}
              className={cn(
                "h-7 w-7 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                currentColor === color && "ring-2 ring-white ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: color }}
              aria-label={`Color ${color}`}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Design notes:**
- Trigger is the current color circle (6x6, clickable)
- Popover shows 6×2 grid of color swatches
- Selected color has white ring with offset
- Hover scales up slightly for affordance

**Verify:** Click color dot → popover opens with 12 colors. Click a new color → popover closes, color updates.

### Step 5: Create Participant Row Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/participant-row.tsx` (new file)

The component should render a table row for a single participant with:
- Checkbox for merge selection (controlled by parent)
- Color dot (clickable → opens ColorPicker)
- Display name: text by default, `Input` when editing
  - Click text → enter edit mode
  - Enter → save (call `participants.update` mutation)
  - Escape → cancel, revert to original text
- "Me" badge if `isMe === true`
- Aliases: comma-separated in a muted text span, or `Badge` components
- Conversation count and message count (right-aligned, tabular-nums)
- Delete button: destructive icon button, disabled with tooltip when `messageCount > 0`

**Design notes:**
- Row hover: `hover:bg-muted/30` for subtle highlighting
- Inline edit Input: same height as text, `border-primary` to indicate edit mode
- Delete button: `Trash2` icon, 16px, `text-destructive` when enabled, `text-muted-foreground` when disabled
- Disabled delete tooltip: "Cannot delete — participant has messages. Use merge instead."

**Verify:** Click name → edit mode activates. Type new name + Enter → saves. Escape → cancels. Color picker works. Delete button disabled for participants with messages.

### Step 6: Create Participant List Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/participant-list.tsx` (new file)

The component should:
- Use `useQuery(api.participants.list)` to fetch all participants
- Render a table with header row and `ParticipantRow` for each participant
- Support sorting by name (alphabetical) or message count (descending) — toggle via header click
- Track selected participant IDs in state for merge selection
- When 2+ selected, show a floating "Merge selected (N)" button at the bottom
- Clicking "Merge selected" opens the MergeDialog
- Show skeleton loading state while data loads
- Show EmptyState if no participants

**Design notes:**
- Table columns: `[ ] | Color | Name | Aliases | Conversations | Messages | Actions`
- Column headers with sort indicators (arrow up/down) for Name and Messages
- Sticky "Merge selected" bar at bottom with count badge
- Wrap in a `Card` for consistent Settings styling

**Verify:** Table renders with correct data. Sort by messages works. Select checkboxes → merge button appears.

### Step 7: Create Merge Dialog Component

**File:** `/Users/robert.sawyer/Git/messagevault/components/settings/merge-dialog.tsx` (new file)

```typescript
// ABOUTME: Merge confirmation dialog — shows selected participants and lets user choose canonical name.
// ABOUTME: Warns about irreversibility and cascading effects on messages.
```

The dialog should:
- Accept selected participants array and open/close state
- Display a list of participants being merged with their names, message counts, and colors
- Provide an `Input` for the canonical display name (pre-filled with the highest-message-count participant's name)
- Provide a `Select` to choose which participant record to keep as the target (default: highest message count)
- Show warning text: "This action cannot be undone. All messages from the merged participants will be attributed to the chosen name."
- Cancel and "Merge" buttons (Merge uses `variant="destructive"`)
- Loading state on Merge button while mutation runs
- Success toast on completion, error toast on failure
- Close dialog and clear selection on success

**Verify:** Dialog shows correct participants. Name input pre-fills. Merge executes correctly. Dialog closes on success.

### Step 8: Wire into Settings Page

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/settings/page.tsx`

**Changes:** Replace the Participants tab EmptyState with `<ParticipantList />`.

```typescript
// In the Participants TabsContent:
import { ParticipantList } from "@/components/settings/participant-list";

<TabsContent value="participants" className="mt-6">
  <ParticipantList />
</TabsContent>
```

**Verify:** Navigate to Settings → Participants tab → full participant list renders.

## 4. Testing Strategy

- **View:** Navigate to Settings → Participants. Verify all participants shown with correct data.
- **Edit name:** Click a participant name → edit → press Enter → verify name updates in participant list AND in browse view messages.
- **Cancel edit:** Click name → edit → press Escape → verify reverts to original.
- **Change color:** Click color dot → select new color → verify color updates in participant list AND in browse view message bubbles.
- **Merge:** Select 2 participants → click Merge → enter canonical name → confirm → verify:
  - Source participant disappears
  - Target participant has combined message count and aliases
  - Messages in browse view show new sender name
  - DailyStats participantBreakdown is updated
- **Delete (blocked):** Click delete on a participant with messages → verify error toast.
- **Delete (allowed):** Click delete on a participant with 0 messages → verify removed from list.
- **Sort:** Click Name header → verify alphabetical sort. Click Messages header → verify descending count sort.
- **Type check:** Run `pnpm build` to verify no TypeScript errors.

## 5. Validation Checklist

- [ ] All participants listed with name, aliases, conversation count, message count, and color
- [ ] Inline name editing works: click → type → Enter saves, Escape cancels
- [ ] Name change cascades to messages (senderName field)
- [ ] Color picker opens, shows 12 colors, selected color highlighted
- [ ] Color change takes effect immediately in browse view
- [ ] Merge: select 2+ → "Merge selected" button appears
- [ ] Merge dialog: shows participants, pre-fills canonical name, warns about irreversibility
- [ ] Merge completes: messages reassigned, aliases combined, counts summed, sources deleted
- [ ] Delete blocked for participants with messageCount > 0
- [ ] Delete succeeds for participants with messageCount === 0
- [ ] Sort by name and message count works
- [ ] "Me" badge shown for isMe participants
- [ ] Loading skeleton while data loads
- [ ] Toast feedback on save/merge/delete actions
- [ ] No TypeScript errors (`pnpm build`)

## 6. Potential Issues & Mitigations

- **Merge mutation size for high-message participants:** A participant with 15K messages will require 15K patch operations in a single mutation. This may exceed Convex's mutation time limit (~10 seconds). **Mitigation:** Start with a single mutation. If it times out during testing, refactor to an action with batched internal mutations (same pattern as the import pipeline in `convex/lib/importer.ts`).
- **Reactions cascade:** Reactions have a `participantId` field but NO `by_participantId` index. The merge mutation can't efficiently query reactions by participant. **Mitigation:** For v1, don't update reaction `participantId` during merge — reactions reference the reacted-to message, not the reactor's participant record in the UI. If this matters later, add a `by_participantId` index to reactions.
- **Race conditions during merge:** If a user browses messages while a merge is in progress, they may see partially updated data. Convex reactivity handles this: queries re-run automatically when underlying data changes. The user will see a brief inconsistency that resolves itself.
- **Display name update cascading to messages:** The `update` mutation updates `senderName` on all messages when `displayName` changes. For participants with many messages, this is a heavy operation. Same mitigation as merge — start simple, refactor if needed.

## 7. Assumptions & Dependencies

- **G2 complete** — Settings page has Tabs structure with "Participants" tab placeholder
- **`participants.list` query** returns all participants for the current user (confirmed)
- **Messages `by_participantId` index** exists for reassignment queries (confirmed — schema line 82)
- **12 participant colors** defined in globals.css as `--color-participant-0` through `--color-participant-11` (confirmed)
- **`avatarColor` field** stores CSS variable values like `"var(--color-participant-3)"` (confirmed from `resolveForImport`)
- **shadcn/ui components:** Checkbox, Dialog, Popover, Input, Badge all installed (confirmed)
- **Sonner toast** installed by G2 (for success/error feedback)
