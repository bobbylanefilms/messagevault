// ABOUTME: Client-side scanner for Apple Messages markdown exports.
// ABOUTME: Extracts metadata (title, participants, dates, message count) without full parsing.

export interface ScannedHeader {
  title: string;
  participantNames: string[];
  contactInfo: string | null;
  exportedAt: string | null;
  totalMessagesReported: number | null;
  totalLines: number;
  estimatedMessages: number;
}

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

    if (
      trimmed.startsWith("# Messages with ") ||
      trimmed.startsWith("# Conversation with ")
    ) {
      title = trimmed.replace(/^#\s+/, "");
    }

    if (
      !contactInfo &&
      /^\*?\*?[\w\s]*:?\s*[\d\-\(\)\+]+/.test(trimmed) &&
      lines.indexOf(line) < 20
    ) {
      contactInfo = trimmed.replace(/^\*+|\*+$/g, "");
    }

    if (/exported\s+(on\s+)?/i.test(trimmed)) {
      exportedAt = trimmed.replace(/.*exported\s+(on\s+)?/i, "").trim();
    }

    const totalMatch = trimmed.match(/total\s+messages?:\s*([\d,]+)/i);
    if (totalMatch && totalMatch[1]) {
      totalMessagesReported = parseInt(totalMatch[1].replace(/,/g, ""), 10);
    }

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
