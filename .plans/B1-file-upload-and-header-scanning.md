# B1: File Upload and Header Scanning — Execution Plan

## 1. Problem Summary

**What:** Build the import page with drag-and-drop file upload, client-side header scanning to extract participant names and metadata, and initial import job creation in Convex.

**Why:** This is the entry point of the entire import pipeline. Without it, users can't get their Apple Messages exports into the system. B2–B5 all depend on B1 completing first.

**Success criteria:**
- User can drag-and-drop or select a `.md`/`.txt` file on the import page
- Client-side scanner extracts: conversation title, participant names, contact info, export date, and estimated message count
- Extracted metadata is displayed for confirmation before proceeding
- An `importJobs` record is created in Convex with status "uploading"
- Invalid files (wrong type, empty) show clear error feedback
- Import history section shows past imports with stats

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx` | Current placeholder page | **Rewrite** — replace with full upload UI |
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Database schema | **Modify** — add `skippedDuplicates` to importJobs |
| `/Users/robert.sawyer/Git/messagevault/convex/lib/auth.ts` | `getUserId()` helper | **Read-only** — use as auth gate pattern |
| `/Users/robert.sawyer/Git/messagevault/convex/users.ts` | User queries/mutations | **Read-only** — pattern reference |
| `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` | Date formatting utils | **Read-only** — reuse `formatRelativeTimestamp` |
| `/Users/robert.sawyer/Git/messagevault/lib/participant-colors.ts` | Color palette | **Read-only** — reuse `getParticipantColor` |
| `/Users/robert.sawyer/Git/messagevault/components/shared/empty-state.tsx` | Empty state component | **Read-only** — use for "no imports yet" state |
| `/Users/robert.sawyer/Git/messagevault/components/ui/card.tsx` | shadcn Card | **Read-only** — use for metadata display |
| `/Users/robert.sawyer/Git/messagevault/components/ui/button.tsx` | shadcn Button | **Read-only** — use for actions |
| `/Users/robert.sawyer/Git/messagevault/app/globals.css` | Theme tokens | **Read-only** — use existing color tokens |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/importJobs.ts` | Import job mutations/queries (create, update status, list) |
| `components/import/file-drop-zone.tsx` | Drag-and-drop upload component |
| `components/import/header-preview.tsx` | Metadata confirmation display |
| `components/import/import-history.tsx` | Past imports list |
| `lib/header-scanner.ts` | Client-side header scanning logic |

### Existing Patterns

- **ABOUTME comments:** Every file starts with two `// ABOUTME:` lines
- **`"use client"`** on components using hooks
- **Convex function pattern:** `query`/`mutation` from `"./_generated/server"`, args validated with `v.*`
- **Auth gate:** Every user-facing function starts with `const userId = await getUserId(ctx);`
- **shadcn imports:** `@/components/ui/*`
- **Feature component dirs:** `components/import/` (matches `components/shell/`, `components/shared/` pattern)

### Schema Issue

The `importJobs` table in `convex/schema.ts` (line 171-191) is **missing the `skippedDuplicates` field** referenced throughout the plan. The schema currently has `parsedMessages`, `embeddedMessages`, `totalMessages` but no `skippedDuplicates`. This must be added as the first step of B1 since subsequent projects (B4) depend on it.

## 3. Detailed Step-by-Step Implementation

### Step 1: Add `skippedDuplicates` to importJobs schema

**File:** `/Users/robert.sawyer/Git/messagevault/convex/schema.ts`

**Change:** Add `skippedDuplicates: v.number()` to the `importJobs` table definition, after line 184 (`parsedMessages: v.number()`).

```typescript
// In the importJobs defineTable call, add after parsedMessages:
skippedDuplicates: v.number(),
```

The full importJobs table should become:
```typescript
importJobs: defineTable({
  userId: v.id("users"),
  status: v.union(
    v.literal("uploading"),
    v.literal("parsing"),
    v.literal("embedding"),
    v.literal("completed"),
    v.literal("failed")
  ),
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
})
  .index("by_userId", ["userId"])
  .index("by_status", ["status"]),
```

**Why:** The app specification and plan.md both reference `skippedDuplicates` for deduplication tracking. It was missed in the A2 schema implementation.

**Verify:** Run `pnpm convex dev` — schema should deploy without errors.

### Step 2: Create the client-side header scanner

**File:** `/Users/robert.sawyer/Git/messagevault/lib/header-scanner.ts` (new)

```typescript
// ABOUTME: Client-side scanner for Apple Messages markdown exports.
// ABOUTME: Extracts metadata (title, participants, dates, message count) without full parsing.

export interface ScannedHeader {
  title: string; // e.g., "Messages with Rob Sawyer"
  participantNames: string[]; // Unique sender names found
  contactInfo: string | null; // Phone/email from header
  exportedAt: string | null; // Export date from header
  totalMessagesReported: number | null; // "Total Messages: N" from header
  totalLines: number; // Line count of the file
  estimatedMessages: number; // Estimated from timestamp line count
}

/**
 * Scan an Apple Messages markdown export to extract metadata.
 * This runs client-side for instant feedback before uploading.
 * Does NOT parse messages — just extracts header info and participant names.
 */
export function scanHeader(content: string): ScannedHeader {
  const lines = content.split("\n");
  let title = "";
  let contactInfo: string | null = null;
  let exportedAt: string | null = null;
  let totalMessagesReported: number | null = null;
  const participantSet = new Set<string>();
  let estimatedMessages = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Title: "# Messages with Rob Sawyer"
    if (trimmed.startsWith("# Messages with ") || trimmed.startsWith("# Conversation with ")) {
      title = trimmed.replace(/^#\s+/, "");
    }

    // Contact info line (phone/email, usually after title)
    // Pattern: lines with phone numbers or emails near the top
    if (!contactInfo && /^\*?\*?[\w\s]*:?\s*[\d\-\(\)\+]+/.test(trimmed) && lines.indexOf(line) < 20) {
      contactInfo = trimmed.replace(/^\*+|\*+$/g, "");
    }

    // Export date: "Exported on March 15, 2026" or similar
    if (/exported\s+(on\s+)?/i.test(trimmed)) {
      exportedAt = trimmed.replace(/.*exported\s+(on\s+)?/i, "").trim();
    }

    // Total messages: "Total Messages: 15,234"
    const totalMatch = trimmed.match(/total\s+messages?:\s*([\d,]+)/i);
    if (totalMatch && totalMatch[1]) {
      totalMessagesReported = parseInt(totalMatch[1].replace(/,/g, ""), 10);
    }

    // Participant names from timestamped message lines:
    // Pattern: "HH:MM AM/PM - **Name**" or "HH:MM - **Name**"
    const participantMatch = trimmed.match(
      /^\d{1,2}:\d{2}(?:\s*(?:AM|PM))?\s*-\s*\*\*(.+?)\*\*/i
    );
    if (participantMatch && participantMatch[1]) {
      participantSet.add(participantMatch[1]);
      estimatedMessages++;
    }
  }

  return {
    title: title || "Untitled Conversation",
    participantNames: Array.from(participantSet).sort(),
    contactInfo,
    exportedAt,
    totalMessagesReported,
    totalLines: lines.length,
    estimatedMessages,
  };
}
```

**Why:** Header scanning happens client-side for instant feedback. This is a pure function with no dependencies.

**Verify:** Test mentally with the known Apple Messages format. The regex patterns match the documented format: `12:03 AM - **Rob Sawyer**`.

**Edge cases:**
- Files with no `# Messages with` header -> title defaults to "Untitled Conversation"
- Files with no participant matches -> empty array (will show as error in UI)
- The regex handles both 12-hour (`12:03 AM`) and 24-hour (`13:03`) time formats
- Participant names with special characters in bold markers should work since the regex is non-greedy

### Step 3: Create the Convex importJobs module

**File:** `/Users/robert.sawyer/Git/messagevault/convex/importJobs.ts` (new)

```typescript
// ABOUTME: Import job management — create, update, list, and query import progress.
// ABOUTME: Import jobs track the full lifecycle of a file import from upload through embedding.

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserId } from "./lib/auth";

/**
 * Create a new import job when a file upload begins.
 */
export const create = mutation({
  args: {
    sourceFilename: v.string(),
    totalLines: v.number(),
    fileContent: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    const jobId = await ctx.db.insert("importJobs", {
      userId: userId as any,
      status: "uploading",
      sourceFilename: args.sourceFilename,
      totalLines: args.totalLines,
      parsedMessages: 0,
      skippedDuplicates: 0,
      embeddedMessages: 0,
      totalMessages: 0,
      startedAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Get a specific import job by ID.
 */
export const get = query({
  args: { jobId: v.id("importJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    // Verify ownership
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user || job.userId !== user._id) return null;
    return job;
  },
});

/**
 * List all import jobs for the current user, newest first.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const jobs = await ctx.db
      .query("importJobs")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return jobs;
  },
});
```

**Why:** The import page needs to create jobs and display import history. These are the minimal CRUD operations for B1.

**Note on `userId as any`:** The `getUserId` helper returns `string` but Convex IDs are typed. The executor may need to adjust the return type of `getUserId` or cast appropriately. Check the actual type — `getUserId` returns `Promise<string>` but the schema expects `v.id("users")`. The existing pattern in `users.ts` doesn't write to other tables so this hasn't been an issue yet. The executor should either:
1. Change `getUserId` return type to `Id<"users">` (import from `convex/values`)
2. Or use a type assertion where needed

**Verify:** Run `pnpm convex dev` — functions should compile and deploy.

### Step 4: Create the FileDropZone component

**File:** `/Users/robert.sawyer/Git/messagevault/components/import/file-drop-zone.tsx` (new)

```typescript
// ABOUTME: Drag-and-drop file upload zone for Apple Messages exports.
// ABOUTME: Accepts .md and .txt files, reads content via FileReader, triggers header scanning.

"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  onFileSelected: (file: File, content: string) => void;
  disabled?: boolean;
}

export function FileDropZone({ onFileSelected, disabled }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const ACCEPTED_TYPES = [".md", ".txt"];
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  function validateFile(file: File): string | null {
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      return `Invalid file type "${ext}". Please select a .md or .txt file.`;
    }
    if (file.size === 0) {
      return "File is empty. Please select a valid export file.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File is too large (max 50MB).";
    }
    return null;
  }

  function readFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsReading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      setIsReading(false);
      const content = e.target?.result as string;
      if (!content || content.trim().length === 0) {
        setError("File appears to be empty after reading.");
        return;
      }
      onFileSelected(file, content);
    };
    reader.onerror = () => {
      setIsReading(false);
      setError("Failed to read file. Please try again.");
    };
    reader.readAsText(file);
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled || isReading) return;

      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    },
    [disabled, isReading] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [disabled, isReading] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="space-y-2">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/50",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        {isReading ? (
          <>
            <FileText className="mb-4 h-12 w-12 animate-pulse text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Reading file...</p>
          </>
        ) : (
          <>
            <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">
              Drop your Apple Messages export here
            </p>
            <p className="mb-4 text-xs text-muted-foreground">
              or click to browse — accepts .md and .txt files
            </p>
            <label className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Choose File
              <input
                type="file"
                accept=".md,.txt"
                onChange={handleFileInput}
                className="sr-only"
                disabled={disabled}
              />
            </label>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
```

**Why:** The upload zone is the primary user interaction for starting an import. It handles file validation, reading, and error display.

**Gotchas:**
- React Compiler is enabled — avoid inline arrow functions as callback dependencies. The `useCallback` pattern is safe.
- `FileReader.readAsText` is async but not a Promise — uses event handlers.
- Reset the file input value after selection so the same file can be re-selected.

### Step 5: Create the HeaderPreview component

**File:** `/Users/robert.sawyer/Git/messagevault/components/import/header-preview.tsx` (new)

```typescript
// ABOUTME: Displays scanned metadata from an Apple Messages export for confirmation.
// ABOUTME: Shows conversation title, participants, dates, and message count before proceeding.

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Users, Calendar, MessageSquare, ArrowRight } from "lucide-react";
import type { ScannedHeader } from "@/lib/header-scanner";

interface HeaderPreviewProps {
  filename: string;
  header: ScannedHeader;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function HeaderPreview({
  filename,
  header,
  onConfirm,
  onCancel,
  isLoading,
}: HeaderPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-5 w-5" />
          {header.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{filename}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Participants */}
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {header.participantNames.length} participant{header.participantNames.length !== 1 ? "s" : ""} found
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {header.participantNames.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Message count */}
        <div className="flex items-center gap-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm">
            ~{header.estimatedMessages.toLocaleString()} messages estimated
            {header.totalMessagesReported && (
              <span className="text-muted-foreground">
                {" "}({header.totalMessagesReported.toLocaleString()} reported in file)
              </span>
            )}
          </p>
        </div>

        {/* File stats */}
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {header.totalLines.toLocaleString()} lines
            {header.exportedAt && <> &middot; Exported {header.exportedAt}</>}
          </p>
        </div>

        {/* Contact info */}
        {header.contactInfo && (
          <p className="text-xs text-muted-foreground">{header.contactInfo}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={onConfirm} disabled={isLoading}>
            Continue to Identity Resolution
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Step 6: Create the ImportHistory component

**File:** `/Users/robert.sawyer/Git/messagevault/components/import/import-history.tsx` (new)

```typescript
// ABOUTME: Shows a list of past import jobs with status, message counts, and timing.
// ABOUTME: Uses reactive Convex query to auto-update as imports complete.

"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { formatRelativeTimestamp } from "@/lib/date-utils";

const STATUS_COLORS: Record<string, string> = {
  uploading: "bg-blue-500/20 text-blue-400",
  parsing: "bg-amber-500/20 text-amber-400",
  embedding: "bg-purple-500/20 text-purple-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-destructive/20 text-destructive",
};

export function ImportHistory() {
  const jobs = useQuery(api.importJobs.list);

  if (!jobs || jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Import History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job._id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">{job.sourceFilename}</p>
                <p className="text-xs text-muted-foreground">
                  {job.totalMessages > 0
                    ? `${job.parsedMessages.toLocaleString()} messages`
                    : "Processing..."}
                  {job.skippedDuplicates > 0 &&
                    ` (${job.skippedDuplicates} duplicates skipped)`}
                  {" \u00b7 "}
                  {formatRelativeTimestamp(job.startedAt)}
                </p>
              </div>
              <Badge className={STATUS_COLORS[job.status] ?? ""}>
                {job.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Step 7: Rewrite the import page with wizard flow

**File:** `/Users/robert.sawyer/Git/messagevault/app/(app)/import/page.tsx` (rewrite)

```typescript
// ABOUTME: Import page — wizard flow for uploading Apple Messages exports.
// ABOUTME: Steps: file upload -> header preview -> identity resolution (B2) -> parsing progress (B4).

"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/shared/page-header";
import { FileDropZone } from "@/components/import/file-drop-zone";
import { HeaderPreview } from "@/components/import/header-preview";
import { ImportHistory } from "@/components/import/import-history";
import { scanHeader, type ScannedHeader } from "@/lib/header-scanner";
import type { Id } from "@/convex/_generated/dataModel";

type ImportStep = "upload" | "preview" | "identity" | "parsing";

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileContent, setFileContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [scannedHeader, setScannedHeader] = useState<ScannedHeader | null>(null);
  const [jobId, setJobId] = useState<Id<"importJobs"> | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);

  const createImportJob = useMutation(api.importJobs.create);

  function handleFileSelected(file: File, content: string) {
    const header = scanHeader(content);
    setFileContent(content);
    setFileName(file.name);
    setScannedHeader(header);
    setStep("preview");
  }

  async function handleConfirmPreview() {
    if (!scannedHeader) return;
    setIsCreatingJob(true);
    try {
      const id = await createImportJob({
        sourceFilename: fileName,
        totalLines: scannedHeader.totalLines,
        fileContent,
      });
      setJobId(id);
      setStep("identity");
    } catch (err) {
      console.error("Failed to create import job:", err);
    } finally {
      setIsCreatingJob(false);
    }
  }

  function handleCancel() {
    setStep("upload");
    setFileContent("");
    setFileName("");
    setScannedHeader(null);
    setJobId(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader
        title="Import Conversations"
        description="Upload your Apple Messages export to get started"
      />

      {step === "upload" && (
        <FileDropZone onFileSelected={handleFileSelected} />
      )}

      {step === "preview" && scannedHeader && (
        <HeaderPreview
          filename={fileName}
          header={scannedHeader}
          onConfirm={handleConfirmPreview}
          onCancel={handleCancel}
          isLoading={isCreatingJob}
        />
      )}

      {step === "identity" && (
        <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          {/* B2 will replace this placeholder */}
          <p>Identity Resolution UI — coming in B2</p>
          <p className="mt-2 text-xs">
            Job ID: {jobId} · {scannedHeader?.participantNames.length} participants to resolve
          </p>
        </div>
      )}

      {step === "parsing" && (
        <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          {/* B4 will replace this placeholder */}
          <p>Import Progress — coming in B4</p>
        </div>
      )}

      <ImportHistory />
    </div>
  );
}
```

**Why:** The wizard flow manages the multi-step import process. Steps after "preview" are placeholders that B2 and B4 will fill in.

**Gotchas:**
- The `fileContent` is stored in React state and passed to the Convex mutation. For very large files (50K+ lines), this is fine since the text fits well under Convex's 1MB mutation limit and browser memory.
- The `createImportJob` mutation stores the file content — B4 will need to read this. **Decision for executor:** Either store `fileContent` on the import job (add field to schema) or use a different transfer mechanism. The simpler approach is to store it temporarily and remove after parsing. Alternatively, the file content can be passed to B4's parsing action separately. The executor should determine the best approach based on Convex's argument size limits for actions.

### Step 8: Verify the `PageHeader` component supports the needed props

**File:** `/Users/robert.sawyer/Git/messagevault/components/shared/page-header.tsx` — read this to confirm it accepts `title` and `description` props. If not, extend it.

## 4. Testing Strategy

**Manual testing steps:**
1. Navigate to `/import` while authenticated
2. Verify the drop zone renders with proper styling
3. Drag a non-.md/.txt file -> should show error
4. Drag an empty file -> should show error
5. Drag a valid Apple Messages export -> should show header preview with:
   - Conversation title
   - Participant names as badges
   - Estimated message count
   - Line count
6. Click "Continue to Identity Resolution" -> should create importJobs record and show B2 placeholder
7. Click "Cancel" -> should return to upload step
8. Verify ImportHistory shows the created job
9. Open Convex dashboard -> verify importJobs record exists with correct data

**Type check:** Run `pnpm build` (with dev server stopped) to verify no TypeScript errors.

## 5. Validation Checklist

- [ ] `skippedDuplicates` field added to `importJobs` schema
- [ ] Convex schema deploys without errors
- [ ] Header scanner extracts title, participants, metadata from test file
- [ ] FileDropZone handles drag-and-drop and file picker
- [ ] Invalid file types show error message
- [ ] Empty files show error message
- [ ] HeaderPreview displays all extracted metadata correctly
- [ ] "Continue" button creates importJobs record in Convex
- [ ] ImportHistory component lists past import jobs
- [ ] Import page wizard navigates between steps correctly
- [ ] All new files have ABOUTME comments
- [ ] No TypeScript errors (`pnpm build`)

## 6. Potential Issues & Mitigations

| Issue | Detection | Mitigation |
|-------|-----------|------------|
| File content too large for Convex mutation argument | Error on upload of very large files | The 1MB limit applies to the mutation argument payload. A 50K-line file at ~20 chars/line = ~1MB. If files exceed this, implement chunked upload via Convex file storage or multiple mutations. Test with the real export file. |
| Header scanning regex doesn't match actual file format | No participants found | Test with actual Apple Messages export. The format may vary — make the regex lenient and handle edge cases. |
| `getUserId` return type mismatch with `v.id("users")` | TypeScript compilation error | Cast the return value or change `getUserId` to return `Id<"users">` |
| React Compiler issues with callback refs | Runtime errors or stale closures | Ensure callbacks are wrapped in `useCallback` with correct dependencies |

## 7. Assumptions & Dependencies

- **A1-A5 are complete** — project setup, schema, auth, app shell, shared utilities all in place
- **Convex dev environment is running** — schema can be deployed
- **Clerk auth is configured** — user can sign in and `getUserId` works
- **Apple Messages export format** matches the documented patterns in the app specification (day headers, timestamp lines, bold participant names)
- **The executor has access to a sample Apple Messages export file** for testing the header scanner
