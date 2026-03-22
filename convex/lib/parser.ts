// ABOUTME: Pure parser for Apple Messages markdown exports — no I/O or database dependencies.
// ABOUTME: Converts raw export text into structured ParsedMessage and ParsedReaction arrays via a line-by-line state machine.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps extracted participant names to their pre-resolved Convex participant IDs. */
export type ParticipantMap = Record<string, string>;

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "link"
  | "attachment_missing";

export type ReactionType =
  | "liked"
  | "loved"
  | "laughed"
  | "disliked"
  | "emphasized"
  | "questioned";

export interface ParsedMessage {
  senderName: string;
  participantId: string;
  timestamp: number;
  dateKey: string;
  content: string;
  rawContent?: string;
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
  errors: string[];
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// "## January 1, 2023" — day header
const DAY_HEADER_RE = /^##\s+(.+)$/;

// "12:03 AM - **Rob Sawyer**" — timestamp + sender
const TIMESTAMP_SENDER_RE = /^(\d{1,2}:\d{2}\s+[AP]M)\s+-\s+\*\*(.+?)\*\*\s*$/;

// Blockquote line: "> content" (content may be empty)
const BLOCKQUOTE_RE = /^>\s?(.*)$/;

// Image attachment: ![Image: filename](path)
const IMAGE_RE = /^!\[Image:\s*[^\]]+\]\(([^)]+)\)\s*$/;

// Video attachment: [Video: filename](path)
const VIDEO_RE = /^\[Video:\s*[^\]]+\]\(([^)]+)\)\s*$/;

// Missing attachment: *[Attachment not found: filename]*
const ATTACHMENT_MISSING_RE = /^\*\[Attachment not found:\s*([^\]]+)\]\*\s*$/;

// Link preview line: [Link Preview: ...]
const LINK_PREVIEW_RE = /^\[Link Preview:/;

// URL anywhere in the line
const URL_RE = /https?:\/\/\S+/;

// Reaction patterns (case-insensitive) — order matters; "Laughed at" before the others
const REACTION_PATTERNS: Array<{ re: RegExp; type: ReactionType }> = [
  { re: /^laughed at\s+"([^"]+)"/i, type: "laughed" },
  { re: /^liked\s+"([^"]+)"/i, type: "liked" },
  { re: /^loved\s+"([^"]+)"/i, type: "loved" },
  { re: /^disliked\s+"([^"]+)"/i, type: "disliked" },
  { re: /^emphasized\s+"([^"]+)"/i, type: "emphasized" },
  { re: /^questioned\s+"([^"]+)"/i, type: "questioned" },
];

// Month names for day header parsing
const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3,
  may: 4, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Parse a day-header string like "January 1, 2023" into a Date at local
 * midnight. Returns null if the format is unrecognised.
 */
export function parseDayHeader(text: string): Date | null {
  // Expected: "Month D, YYYY" — allow optional day ordinals (1st, 2nd, …)
  const match = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/);
  if (!match) return null;

  // match[1..3] are guaranteed present when the full pattern matched
  const monthName = match[1]!.toLowerCase();
  const month = MONTH_NAMES[monthName];
  if (month === undefined) return null;

  const day = parseInt(match[2]!, 10);
  const year = parseInt(match[3]!, 10);
  if (isNaN(day) || isNaN(year)) return null;

  return new Date(year, month, day); // local midnight
}

/**
 * Combine a Date at local midnight with a time string like "12:03 AM" and
 * return an epoch millisecond timestamp. Returns 0 if either input is missing.
 */
export function combineDateAndTime(date: Date | null, timeStr: string): number {
  if (!date) return 0;

  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s+([AP]M)$/i);
  if (!match) return 0;

  // match[1..3] are guaranteed present when the full pattern matched
  let hours = parseInt(match[1]!, 10);
  const minutes = parseInt(match[2]!, 10);
  const meridiem = match[3]!.toUpperCase();

  // 12:xx AM → 0:xx (midnight hour); 12:xx PM → 12:xx (noon hour)
  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  } else if (meridiem === "PM" && hours !== 12) {
    hours += 12;
  }

  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result.getTime();
}

/**
 * Convert an epoch millisecond timestamp to a "YYYY-MM-DD" date key
 * in local time.
 */
export function toDateKeyLocal(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Attempt to parse a blockquote content line as a reaction.
 * Returns the reaction type and quoted text, or null if not a reaction.
 */
export function parseReactionLine(
  content: string
): { type: ReactionType; quotedText: string } | null {
  for (const { re, type } of REACTION_PATTERNS) {
    const match = content.match(re);
    if (match) {
      // match[1] is the capture group, guaranteed present when pattern matched
      return { type, quotedText: match[1]! };
    }
  }
  return null;
}

/**
 * Classify a single blockquote content line and extract attachment metadata.
 */
function classifyContent(line: string): {
  messageType: MessageType;
  attachmentRef?: string;
} {
  // Image
  const imgMatch = line.match(IMAGE_RE);
  if (imgMatch) {
    // imgMatch[1] is the capture group for the attachment path
    return { messageType: "image", attachmentRef: imgMatch[1]! };
  }

  // Video
  const videoMatch = line.match(VIDEO_RE);
  if (videoMatch) {
    return { messageType: "video", attachmentRef: videoMatch[1]! };
  }

  // Missing attachment
  const missingMatch = line.match(ATTACHMENT_MISSING_RE);
  if (missingMatch) {
    return { messageType: "attachment_missing", attachmentRef: missingMatch[1]! };
  }

  // Link preview or bare URL
  if (LINK_PREVIEW_RE.test(line) || URL_RE.test(line)) {
    return { messageType: "link" };
  }

  return { messageType: "text" };
}

// ---------------------------------------------------------------------------
// State machine internals
// ---------------------------------------------------------------------------

interface PendingMessage {
  senderName: string;
  participantId: string;
  timestamp: number;
  timeStr: string;
  contentLines: string[];
}

/**
 * Flush the accumulated pending message into the result arrays.
 * Reactions are placed in reactions[]; regular messages in messages[].
 */
function flushPending(
  pending: PendingMessage | null,
  currentDate: Date | null,
  messages: ParsedMessage[],
  reactions: ParsedReaction[],
  errors: string[]
): void {
  if (!pending) return;

  const { senderName, participantId, timestamp, contentLines } = pending;

  // Join all content lines (multi-line blockquotes separated by newline)
  const rawContent = contentLines.join("\n");

  // Determine if this is a reaction (single content block that matches a reaction pattern)
  // We check the joined content as the reaction verb and quoted text may not span lines.
  // In practice reactions are single-line blockquotes.
  const reactionResult = parseReactionLine(rawContent);
  if (reactionResult) {
    reactions.push({
      senderName,
      participantId,
      reactionType: reactionResult.type,
      quotedText: reactionResult.quotedText,
      timestamp,
    });
    return;
  }

  // Not a reaction — classify the message type by inspecting content lines.
  // We determine the type from the first non-empty line (since a message is
  // usually a single semantic unit), then fall back to text for multi-line.
  let messageType: MessageType = "text";
  let attachmentRef: string | undefined;

  for (const line of contentLines) {
    if (line.trim() === "") continue;
    const classification = classifyContent(line);
    messageType = classification.messageType;
    attachmentRef = classification.attachmentRef;
    break; // Use the first meaningful line to classify the message
  }

  // For messages with no content lines, skip (shouldn't happen but guard)
  if (contentLines.length === 0) {
    errors.push(
      `Empty message body from "${senderName}" at timestamp ${timestamp} — skipped`
    );
    return;
  }

  // Build the cleaned content string: strip markdown attachment syntax so the
  // stored content is human-readable. For text messages, preserve as-is.
  let content = rawContent;

  const ts = timestamp > 0 ? timestamp : 0;
  const dateKey =
    ts > 0
      ? toDateKeyLocal(ts)
      : currentDate
        ? toDateKeyLocal(currentDate.getTime())
        : "0000-00-00";

  const msg: ParsedMessage = {
    senderName,
    participantId,
    timestamp: ts,
    dateKey,
    content,
    messageType,
  };

  // Only store rawContent when it differs (i.e., when we would have cleaned it)
  // For now content === rawContent; future stages may strip markdown.
  if (rawContent !== content) {
    msg.rawContent = rawContent;
  }

  if (attachmentRef !== undefined) {
    msg.attachmentRef = attachmentRef;
  }

  messages.push(msg);
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse an Apple Messages markdown export into structured messages and reactions.
 *
 * @param content - The full text of the exported markdown file.
 * @param participantMap - Map from display name to Convex participant ID.
 *   Names not present in the map will produce participantId "".
 * @returns ParseResult with messages, reactions, and any non-fatal error strings.
 */
export function parseAppleMessages(
  content: string,
  participantMap: ParticipantMap
): ParseResult {
  const messages: ParsedMessage[] = [];
  const reactions: ParsedReaction[] = [];
  const errors: string[] = [];

  // State
  let currentDate: Date | null = null;
  let pending: PendingMessage | null = null;

  const lines = content.split("\n");
  let lineIndex = 0;

  for (const line of lines) {
    lineIndex++;

    // -----------------------------------------------------------------------
    // Day header: ## January 1, 2023
    // -----------------------------------------------------------------------
    const dayHeaderMatch = line.match(DAY_HEADER_RE);
    if (dayHeaderMatch) {
      // Flush any pending message before advancing date
      flushPending(pending, currentDate, messages, reactions, errors);
      pending = null;

      // dayHeaderMatch[1] is the captured header text, guaranteed present
      const headerText = dayHeaderMatch[1]!;
      const parsed = parseDayHeader(headerText);
      if (parsed) {
        currentDate = parsed;
      } else {
        errors.push(`Could not parse day header: "${headerText}" (line ${lineIndex})`);
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Timestamp + sender: 12:03 AM - **Rob Sawyer**
    // -----------------------------------------------------------------------
    const timestampMatch = line.match(TIMESTAMP_SENDER_RE);
    if (timestampMatch) {
      // Flush any pending message
      flushPending(pending, currentDate, messages, reactions, errors);

      // timestampMatch[1] = time string, timestampMatch[2] = sender name
      const timeStr = timestampMatch[1]!;
      const senderName = timestampMatch[2]!;
      const participantId = participantMap[senderName] ?? "";
      const timestamp = combineDateAndTime(currentDate, timeStr);

      pending = {
        senderName,
        participantId,
        timestamp,
        timeStr,
        contentLines: [],
      };
      continue;
    }

    // -----------------------------------------------------------------------
    // Blockquote content line: > ...
    // -----------------------------------------------------------------------
    const blockquoteMatch = line.match(BLOCKQUOTE_RE);
    if (blockquoteMatch) {
      if (pending) {
        // blockquoteMatch[1] is the content after "> " (may be empty string)
        pending.contentLines.push(blockquoteMatch[1]!);
      }
      // Blockquote with no active sender: skip silently
      continue;
    }

    // -----------------------------------------------------------------------
    // Everything else (blank lines, metadata lines, file header, etc.) — skip
    // -----------------------------------------------------------------------
  }

  // Flush any remaining pending message at end of file
  flushPending(pending, currentDate, messages, reactions, errors);

  return { messages, reactions, errors };
}
