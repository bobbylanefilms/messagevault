// ABOUTME: Date and time formatting utilities used across MessageVault.
// ABOUTME: Handles relative timestamps, day headers, date keys, and message grouping logic.

/**
 * Convert a Unix timestamp (ms) to an ISO date key string: "2023-01-15"
 */
export function toDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Parse a date key string back to a Date at midnight local time.
 */
export function fromDateKey(dateKey: string): Date {
  const parts = dateKey.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day);
}

/**
 * Format a date key for display as a day header: "Tuesday, January 15, 2023"
 */
export function formatDayHeader(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a timestamp as a short time string: "2:34 PM"
 */
export function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format a timestamp as a relative string: "just now", "2m ago", "3h ago",
 * "Yesterday", or "Jan 15" for older.
 */
export function formatRelativeTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  const today = new Date();
  const date = new Date(timestamp);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
}

/**
 * Check if two timestamps fall on the same calendar day (local time).
 */
export function isSameDay(a: number, b: number): boolean {
  return toDateKey(a) === toDateKey(b);
}

/**
 * Check if two timestamps are within N minutes of each other.
 * Used for message grouping (consecutive messages from same sender within 2min).
 */
export function isWithinMinutes(
  a: number,
  b: number,
  minutes: number,
): boolean {
  return Math.abs(a - b) <= minutes * 60 * 1000;
}

/**
 * Format a date range for display: "Jan 15 – Mar 20, 2023" or
 * "Dec 28, 2022 – Jan 5, 2023" when spanning years.
 */
export function formatDateRange(
  startTimestamp: number,
  endTimestamp: number,
): string {
  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);
  const sameYear = start.getFullYear() === end.getFullYear();

  const startStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(!sameYear && { year: "numeric" }),
  });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${startStr} \u2013 ${endStr}`;
}
