# B2: Identity Resolution UI — Execution Plan

## 1. Problem Summary

**What:** After B1's header scanning extracts participant names from the file, present a UI where the user maps "Me" to their real name, matches extracted names against existing participants, and creates/links participant records before parsing begins.

**Why:** Apple Messages exports use "Me" as a sender name, plus display names that may vary across exports ("Mom" vs "Lisa"). Without identity resolution, the system can't properly associate messages with canonical participant records or identify which messages belong to the importing user.

**Success criteria:**
- "Who is Me?" prompt appears pre-filled with the user's `realName` from their profile
- All extracted participant names are listed with match/create controls
- Fuzzy matching suggests existing participants for linking
- New participants are created with assigned colors
- Aliases are recorded when names differ from canonical display names
- "Start Import" button proceeds to B4's parsing pipeline
- Participant records are correctly created/updated in Convex

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx` | Import page wizard (from B1) | **Modify** — add identity step rendering |
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Schema with participants table | **Read-only** — reference for participant fields |
| `/Users/robert.sawyer/Git/messagevault/convex/users.ts` | `currentUser` query | **Read-only** — use for pre-filling realName |
| `/Users/robert.sawyer/Git/messagevault/convex/lib/auth.ts` | `getUserId()` helper | **Read-only** — auth gate |
| `/Users/robert.sawyer/Git/messagevault/lib/participant-colors.ts` | `getParticipantColor()` function | **Read-only** — assign colors to new participants |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/participants.ts` | Participant CRUD: create, search, merge, list |
| `components/import/identity-resolution.tsx` | The full identity resolution step UI |

### Existing Schema — Participants Table

From `convex/schema.ts` lines 43-57:
```typescript
participants: defineTable({
  userId: v.id("users"),
  displayName: v.string(),
  aliases: v.array(v.string()),
  isMe: v.boolean(),
  avatarColor: v.string(),
  conversationCount: v.number(),
  messageCount: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_displayName", ["userId", "displayName"])
  .searchIndex("search_name", {
    searchField: "displayName",
    filterFields: ["userId"],
  }),
```

## 3. Detailed Step-by-Step Implementation

### Step 1: Create the Convex participants module

**File:** `/Users/robert.sawyer/Git/messagevault/convex/participants.ts` (new)

```typescript
// ABOUTME: Participant management — search, create, merge, and list operations.
// ABOUTME: Participants are canonical people across all conversations, supporting alias dedup.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * List all participants for the current user.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    return await ctx.db
      .query("participants")
      .withIndex("by_userId", (q) => q.eq("userId", userId as any))
      .collect();
  },
});

/**
 * Search participants by name (fuzzy via search index).
 */
export const search = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!args.searchTerm.trim()) return [];

    return await ctx.db
      .query("participants")
      .withSearchIndex("search_name", (q) =>
        q.search("displayName", args.searchTerm).eq("userId", userId as any)
      )
      .take(10);
  },
});

/**
 * Find a participant by exact display name.
 */
export const findByName = query({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    return await ctx.db
      .query("participants")
      .withIndex("by_userId_displayName", (q) =>
        q.eq("userId", userId as any).eq("displayName", args.displayName)
      )
      .unique();
  },
});

/**
 * Create or link participants for an import.
 * Takes a mapping of extracted names to resolution decisions.
 */
export const resolveForImport = mutation({
  args: {
    resolutions: v.array(
      v.object({
        extractedName: v.string(),
        action: v.union(v.literal("create"), v.literal("link")),
        isMe: v.boolean(),
        // If action is "link", the existing participant to link to
        existingParticipantId: v.optional(v.id("participants")),
        // For "create" — the display name to use
        displayName: v.string(),
        // Color to assign (for new participants)
        avatarColor: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const participantMap: Record<string, string> = {}; // extractedName -> participantId

    for (const resolution of args.resolutions) {
      if (resolution.action === "link" && resolution.existingParticipantId) {
        // Link to existing participant — add alias if name differs
        const existing = await ctx.db.get(resolution.existingParticipantId);
        if (existing && existing.userId === (userId as any)) {
          if (
            resolution.extractedName !== existing.displayName &&
            !existing.aliases.includes(resolution.extractedName)
          ) {
            await ctx.db.patch(resolution.existingParticipantId, {
              aliases: [...existing.aliases, resolution.extractedName],
            });
          }
          participantMap[resolution.extractedName] = resolution.existingParticipantId;
        }
      } else {
        // Create new participant
        const participantId = await ctx.db.insert("participants", {
          userId: userId as any,
          displayName: resolution.displayName,
          aliases:
            resolution.extractedName !== resolution.displayName
              ? [resolution.extractedName]
              : [],
          isMe: resolution.isMe,
          avatarColor: resolution.avatarColor,
          conversationCount: 0,
          messageCount: 0,
        });
        participantMap[resolution.extractedName] = participantId;
      }
    }

    return participantMap;
  },
});
```

### Step 2: Create the IdentityResolution component

**File:** `/Users/robert.sawyer/Git/messagevault/components/import/identity-resolution.tsx` (new)

This component should:

1. Accept `participantNames: string[]` from the scanned header and the user's `realName`
2. Show a "Who is Me?" section at the top — dropdown/input pre-filled with the user's `realName`
3. For each extracted name (other than the one matched to "Me"):
   - Show the extracted name
   - Query existing participants for fuzzy matches
   - Offer toggle: "Create new" or "Link to existing [suggestion]"
   - If linking, show the matched participant's display name
4. Assign colors from `getParticipantColor()` to new participants
5. "Start Import" button calls `resolveForImport` mutation and proceeds

**Key implementation details:**

```typescript
"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getParticipantColor } from "@/lib/participant-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, UserPlus, ArrowRight } from "lucide-react";

interface IdentityResolutionProps {
  participantNames: string[];
  onComplete: (participantMap: Record<string, string>) => void;
  onCancel: () => void;
}

export function IdentityResolution({
  participantNames,
  onComplete,
  onCancel,
}: IdentityResolutionProps) {
  // Fetch user profile for realName pre-fill
  const currentUser = useQuery(api.users.currentUser);
  // Fetch existing participants for matching
  const existingParticipants = useQuery(api.participants.list);
  const resolveParticipants = useMutation(api.participants.resolveForImport);

  // State: which extracted name is "Me"
  const [meSelection, setMeSelection] = useState<string>("");
  // State: per-participant resolution decisions
  const [resolutions, setResolutions] = useState<
    Map<string, { action: "create" | "link"; linkedTo?: string }>
  >(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detect "Me" based on realName match
  useMemo(() => {
    if (currentUser?.realName && !meSelection) {
      const match = participantNames.find(
        (name) => name.toLowerCase() === currentUser.realName.toLowerCase()
      );
      if (match) setMeSelection(match);
    }
  }, [currentUser, participantNames, meSelection]);

  // ... render UI with:
  // 1. "Who is Me?" dropdown from participantNames, pre-filled
  // 2. For each other participant:
  //    - Name display
  //    - Auto-suggested match from existingParticipants (by name similarity)
  //    - Toggle: "Create new" / "Link to [existing]"
  // 3. "Start Import" button

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const colorOffset = existingParticipants?.length ?? 0;
      let newColorIndex = 0;

      const resolutionArray = participantNames.map((name) => {
        const isMe = name === meSelection;
        const decision = resolutions.get(name);

        if (decision?.action === "link" && decision.linkedTo) {
          return {
            extractedName: name,
            action: "link" as const,
            isMe,
            existingParticipantId: decision.linkedTo as any,
            displayName: name,
            avatarColor: "",
          };
        }

        const color = getParticipantColor(colorOffset + newColorIndex);
        newColorIndex++;
        return {
          extractedName: name,
          action: "create" as const,
          isMe,
          displayName: isMe ? (currentUser?.realName ?? name) : name,
          avatarColor: color,
        };
      });

      const participantMap = await resolveParticipants({
        resolutions: resolutionArray,
      });
      onComplete(participantMap);
    } catch (err) {
      console.error("Failed to resolve participants:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Full JSX render with Card layout, participant list, and action buttons
  // ... (implement the full component UI here)
}
```

**Me-detection logic:** If only one name in `participantNames` matches the user's `realName` (case-insensitive), auto-select it as "Me". If no match, show the "Who is Me?" prompt. If the user hasn't set a `realName`, prompt them to enter one.

**Color assignment:** New participants get colors from `getParticipantColor(index)` where index is the count of existing participants + the index of the new participant in the creation order.

### Step 3: Update the import page to wire in identity resolution

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx`

Replace the B2 placeholder div (in the `step === "identity"` branch) with:
```tsx
{step === "identity" && scannedHeader && (
  <IdentityResolution
    participantNames={scannedHeader.participantNames}
    onComplete={handleIdentityResolved}
    onCancel={handleCancel}
  />
)}
```

Add handler:
```typescript
function handleIdentityResolved(participantMap: Record<string, string>) {
  setParticipantMap(participantMap);
  setStep("parsing");
  // B4 will pick up from here — start the parsing pipeline
}
```

Add state:
```typescript
const [participantMap, setParticipantMap] = useState<Record<string, string> | null>(null);
```

## 4. Testing Strategy

1. Import a file with known participant names
2. Verify "Me" is auto-detected if `realName` matches
3. Verify existing participants show as link suggestions on second import
4. Create new participants and verify they appear in Convex dashboard
5. Link to existing participant with different name -> verify alias added
6. Verify color assignment doesn't duplicate existing participants' colors
7. Type check: `pnpm build`

## 5. Validation Checklist

- [ ] `convex/participants.ts` created with list, search, findByName, resolveForImport
- [ ] IdentityResolution component renders all extracted names
- [ ] "Me" auto-detected from `realName` match
- [ ] New participants created with correct colors and aliases
- [ ] Existing participants linked with alias recording
- [ ] Import page wizard navigates from preview -> identity -> parsing
- [ ] All files have ABOUTME comments
- [ ] No TypeScript errors

## 6. Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| `getUserId` returns `string`, schema expects `Id<"users">` | Same issue as B1 — use consistent type assertion or fix `getUserId` return type |
| Search index query syntax for Convex | Verify `.withSearchIndex` usage against Convex docs — search index queries require `.search()` on the search field and `.eq()` on filter fields |
| User has no `realName` set | Fall back to `displayName` from user record; show text input for manual entry |
| Many existing participants -> long matching UI | Limit fuzzy search results to top 5; use debounced search input |

## 7. Assumptions & Dependencies

- **B1 is complete** — file upload, header scanning, import job creation
- **User record exists** with `realName` field populated (from Clerk profile)
- **Convex search index** on participants is deployed and functional
- **The executor reads `components/shared/page-header.tsx`** to understand the PageHeader component's props
