# B3: Message Parser — Execution Plan

## 1. Problem Summary

**What:** Build the core markdown parser that transforms Apple Messages export format into structured message and reaction arrays. This is a pure function — no UI, no Convex integration, no batching.

**Why:** The parser is the heart of the import pipeline. It transforms raw text into the structured data that every downstream feature depends on (browse, search, calendar, AI chat). Getting it right — handling all format variants, edge cases, and reaction linking — is critical.

**Success criteria:**
- Parser handles all documented message types: text, images, videos, links, missing attachments
- Day headers correctly set the date context for subsequent messages
- Timestamps combine with day headers to produce full epoch ms values
- Multi-line blockquote messages are concatenated properly
- Reactions are extracted with type, reactor name, and quoted text
- Parser returns both messages and reactions arrays
- Parser is a pure function: `(text, participantMap) -> { messages, reactions }`

## 2. Current State Analysis

### Relevant Files

| File | Purpose | Action |
|------|---------|--------|
| `/Users/robert.sawyer/Git/messagevault/convex/lib/` | Backend utility directory | Create `parser.ts` here |
| `/Users/robert.sawyer/Git/messagevault/convex/schema.ts` | Schema — message and reaction types | **Read-only** — reference for output types |
| `/Users/robert.sawyer/Git/messagevault/lib/date-utils.ts` | Date utilities | **Read-only** — `toDateKey()` logic reference (but parser runs server-side, so reimplement or import) |

### New Files to Create

| File | Purpose |
|------|---------|
| `convex/lib/parser.ts` | The Apple Messages markdown parser |

### Apple Messages Export Format (from app specification)

```markdown
# Messages with Rob Sawyer

Contact: +1 (555) 123-4567
Exported on March 15, 2026
Total Messages: 15,234

## January 1, 2023

12:03 AM - **Rob Sawyer**
> Happy New Year!

12:04 AM - **Mom**
> Happy New Year, sweetie!
> Love you so much!

12:05 AM - **Rob Sawyer**
> Liked "Happy New Year, sweetie!"

12:10 AM - **Mom**
> ![Image: nye-fireworks.jpg](attachments/1_nye-fireworks.jpg)

12:15 AM - **Rob Sawyer**
> [Video: nye-countdown.mp4](attachments/2_nye-countdown.mp4)

12:20 AM - **Mom**
> Check this out: https://example.com
> [Link Preview: Example Site]

12:25 AM - **Rob Sawyer**
> *[Attachment not found: old-photo.jpg]*
```

## 3. Detailed Step-by-Step Implementation

### Step 1: Define parser types

**File:** `/Users/robert.sawyer/Git/messagevault/convex/lib/parser.ts` (new)

```typescript
// ABOUTME: Parses Apple Messages markdown exports into structured message and reaction records.
// ABOUTME: State machine handles day headers, timestamps, reactions, attachments, and multi-line content.

/**
 * Map of extracted participant names to their Convex participant IDs.
 * Built by the identity resolution step (B2).
 */
export type ParticipantMap = Record<string, string>;

export type MessageType = "text" | "image" | "video" | "link" | "attachment_missing";

export type ReactionType = "liked" | "loved" | "laughed" | "disliked" | "emphasized" | "questioned";

export interface ParsedMessage {
  senderName: string;
  participantId: string;
  timestamp: number; // epoch ms
  dateKey: string; // "2023-01-15"
  content: string; // plain text
  rawContent?: string; // original markdown if different
  messageType: MessageType;
  attachmentRef?: string;
}

export interface ParsedReaction {
  participantId: string;
  senderName: string;
  reactionType: ReactionType;
  quotedText: string;
  timestamp: number;
}

export interface ParseResult {
  messages: ParsedMessage[];
  reactions: ParsedReaction[];
  errors: string[]; // non-fatal parsing warnings
}
```

### Step 2: Implement the parser

```typescript
/**
 * Parse an Apple Messages markdown export into structured records.
 *
 * @param content - Raw file content
 * @param participantMap - Map of extracted names -> participant IDs
 * @returns Parsed messages, reactions, and any parsing warnings
 */
export function parseAppleMessages(
  content: string,
  participantMap: ParticipantMap
): ParseResult {
  const lines = content.split("\n");
  const messages: ParsedMessage[] = [];
  const reactions: ParsedReaction[] = [];
  const errors: string[] = [];

  // State machine
  let currentDate: Date | null = null; // from ## day headers
  let currentSender: string | null = null;
  let currentSenderId: string | null = null;
  let currentTimestamp: number | null = null;
  let currentContent: string[] = []; // accumulates multi-line messages
  let currentRawContent: string[] = [];
  let currentMessageType: MessageType = "text";
  let currentAttachmentRef: string | undefined;

  // Helper: flush the accumulated message
  function flushMessage() {
    if (currentSender && currentTimestamp !== null && currentContent.length > 0) {
      const contentStr = currentContent.join("\n").trim();
      const rawContentStr = currentRawContent.join("\n").trim();
      if (contentStr) {
        messages.push({
          senderName: currentSender,
          participantId: currentSenderId ?? "",
          timestamp: currentTimestamp,
          dateKey: toDateKeyLocal(currentTimestamp),
          content: contentStr,
          rawContent: rawContentStr !== contentStr ? rawContentStr : undefined,
          messageType: currentMessageType,
          attachmentRef: currentAttachmentRef,
        });
      }
    }
    currentContent = [];
    currentRawContent = [];
    currentMessageType = "text";
    currentAttachmentRef = undefined;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // --- Day header: "## January 1, 2023" ---
    const dayMatch = trimmed.match(/^##\s+(.+)$/);
    if (dayMatch && dayMatch[1]) {
      flushMessage();
      const parsed = parseDayHeader(dayMatch[1]);
      if (parsed) {
        currentDate = parsed;
      } else {
        errors.push(`Unparseable day header: "${dayMatch[1]}"`);
      }
      continue;
    }

    // --- Timestamp + sender: "12:03 AM - **Rob Sawyer**" ---
    const msgMatch = trimmed.match(
      /^(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)\s*-\s*\*\*(.+?)\*\*\s*$/i
    );
    if (msgMatch && msgMatch[1] && msgMatch[2]) {
      flushMessage();
      const timeStr = msgMatch[1];
      const senderName = msgMatch[2];
      currentSender = senderName;
      currentSenderId = participantMap[senderName] ?? "";
      currentTimestamp = combineDateAndTime(currentDate, timeStr);
      continue;
    }

    // --- Blockquoted content: "> message text" ---
    if (trimmed.startsWith("> ") || trimmed === ">") {
      const lineContent = trimmed === ">" ? "" : trimmed.substring(2);
      currentRawContent.push(lineContent);

      // Check for reaction patterns
      const reactionResult = parseReactionLine(lineContent);
      if (reactionResult && currentSender && currentTimestamp !== null) {
        // This is a reaction, not a regular message
        reactions.push({
          participantId: currentSenderId ?? "",
          senderName: currentSender,
          reactionType: reactionResult.type,
          quotedText: reactionResult.quotedText,
          timestamp: currentTimestamp,
        });
        // Reset sender state since reaction consumes the message slot
        currentSender = null;
        currentTimestamp = null;
        currentContent = [];
        currentRawContent = [];
        continue;
      }

      // Check for image: ![Image: filename](attachments/N_filename)
      const imageMatch = lineContent.match(
        /^!\[Image:\s*(.+?)\]\((.+?)\)\s*$/
      );
      if (imageMatch) {
        currentMessageType = "image";
        currentAttachmentRef = imageMatch[2];
        currentContent.push(`[Image: ${imageMatch[1]}]`);
        continue;
      }

      // Check for video: [Video: filename](attachments/N_filename)
      const videoMatch = lineContent.match(
        /^\[Video:\s*(.+?)\]\((.+?)\)\s*$/
      );
      if (videoMatch) {
        currentMessageType = "video";
        currentAttachmentRef = videoMatch[2];
        currentContent.push(`[Video: ${videoMatch[1]}]`);
        continue;
      }

      // Check for missing attachment: *[Attachment not found: filename]*
      const missingMatch = lineContent.match(
        /^\*\[Attachment not found:\s*(.+?)\]\*\s*$/
      );
      if (missingMatch) {
        currentMessageType = "attachment_missing";
        currentAttachmentRef = missingMatch[1];
        currentContent.push(`[Missing attachment: ${missingMatch[1]}]`);
        continue;
      }

      // Check for link with preview
      if (lineContent.match(/^\[Link Preview:/)) {
        currentMessageType = "link";
        currentContent.push(lineContent);
        continue;
      }
      if (lineContent.match(/^https?:\/\//) && currentMessageType !== "link") {
        currentMessageType = "link";
      }

      // Regular text content
      currentContent.push(lineContent);
      continue;
    }

    // Empty lines and non-matching lines just skip
    // (header lines like "# Messages with..." and metadata are ignored)
  }

  // Flush the last accumulated message
  flushMessage();

  return { messages, reactions, errors };
}
```

### Step 3: Implement helper functions

```typescript
// --- Helper functions ---

/**
 * Parse a day section header like "January 1, 2023" into a Date.
 * Handles various formats the export might use.
 */
function parseDayHeader(text: string): Date | null {
  // Try standard format: "January 1, 2023" or "Jan 1, 2023"
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Try other patterns as needed
  // "1/1/2023", "2023-01-01", etc.
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(
      parseInt(isoMatch[1]!, 10),
      parseInt(isoMatch[2]!, 10) - 1,
      parseInt(isoMatch[3]!, 10)
    );
  }

  return null;
}

/**
 * Combine a Date (from day header) with a time string like "12:03 AM" or "13:03"
 * to produce an epoch ms timestamp.
 */
function combineDateAndTime(date: Date | null, timeStr: string): number {
  if (!date) return 0;

  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return date.getTime();

  let hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  const ampm = match[3]?.toUpperCase();

  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result.getTime();
}

/**
 * Convert epoch ms to ISO date key "2023-01-15".
 * Reimplemented here for server-side use (can't import from lib/date-utils in Convex).
 */
function toDateKeyLocal(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Reaction patterns: "Liked "quoted text""
const REACTION_PATTERNS: Array<{ pattern: RegExp; type: ReactionType }> = [
  { pattern: /^(?:.*)?Liked\s+"(.+)"$/i, type: "liked" },
  { pattern: /^(?:.*)?Loved\s+"(.+)"$/i, type: "loved" },
  { pattern: /^(?:.*)?Laughed at\s+"(.+)"$/i, type: "laughed" },
  { pattern: /^(?:.*)?Disliked\s+"(.+)"$/i, type: "disliked" },
  { pattern: /^(?:.*)?Emphasized\s+"(.+)"$/i, type: "emphasized" },
  { pattern: /^(?:.*)?Questioned\s+"(.+)"$/i, type: "questioned" },
];

function parseReactionLine(
  content: string
): { type: ReactionType; quotedText: string } | null {
  for (const { pattern, type } of REACTION_PATTERNS) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return { type, quotedText: match[1] };
    }
  }
  return null;
}
```

### Step 4: Test with sample data

The executor should create a simple test by calling the parser with known input and verifying output. Since this is a Convex lib file, it can be tested by:

1. Creating a temporary test script or using the Convex dashboard's function runner
2. Or extracting the pure function to a shared location testable with Node.js

**Test cases:**
- Single day, multiple messages -> correct timestamps and ordering
- Multi-line message -> concatenated into single content string
- Reactions -> separated into reactions array with correct quoted text
- Images, videos, missing attachments -> correct messageType and attachmentRef
- Multiple day headers -> date context switches correctly
- Time format with AM/PM -> correct 24-hour conversion
- Edge: "12:00 AM" = midnight, "12:00 PM" = noon

## 4. Testing Strategy

Create test data covering all format variations from the spec. The parser is pure, so test it with direct function calls.

**Minimum test cases:**
1. Basic text messages across two days
2. Multi-line blockquote messages
3. All 6 reaction types
4. Image, video, link, missing attachment messages
5. Group chat with 3+ participants
6. Empty content lines (just `>`)
7. Messages without a prior day header (edge case — should handle gracefully)

## 5. Validation Checklist

- [ ] Parser handles all documented message formats
- [ ] Day headers correctly set date context
- [ ] Timestamps computed correctly (AM/PM conversion, midnight/noon edge cases)
- [ ] Multi-line messages concatenated
- [ ] Reactions extracted separately with quoted text
- [ ] Image/video/link/missing attachment types detected
- [ ] `dateKey` generated for each message
- [ ] Parser returns errors array for unparseable content (non-fatal)
- [ ] Pure function — no side effects, no Convex imports
- [ ] ABOUTME comments present
- [ ] No TypeScript errors

## 6. Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| Real export format differs from documented format | Test with actual Apple Messages export file early. Parser should be lenient — log warnings for unrecognized lines rather than failing. |
| Timezone handling in date parsing | `new Date("January 1, 2023")` uses local timezone. This is correct for messages — they're in the user's local time. Document this assumption. |
| Reaction quoted text truncated in export | Apple Messages may truncate long messages in reaction quotes. The quoted text matching in B4 will need fuzzy matching. |
| Unicode emoji prefixes on reactions | The regex patterns include optional emoji prefixes. Real files may or may not include them. |
| `new Date(text)` parsing varies by browser/runtime | The parser runs in Convex (Node.js runtime), not browser. Node.js `Date` parsing is consistent. |

## 7. Assumptions & Dependencies

- **B1 and B2 are complete** — the `ParticipantMap` comes from B2's identity resolution
- **Parser runs in Convex action context** — Node.js runtime, not browser
- **Apple Messages export format** matches the documented patterns. The executor should test with a real export file as early as possible.
- **No external dependencies** — parser is pure TypeScript with no imports
