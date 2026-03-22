// ABOUTME: Deterministic participant color palette for avatar and bubble colors.
// ABOUTME: 12 distinct oklch colors optimized for dark backgrounds with white/light text.

/**
 * Fixed palette of 12 visually distinct colors for participant identification.
 * All colors use oklch for perceptual uniformity. Designed to:
 * - Be distinct from each other at a glance
 * - Work as bubble backgrounds with white text on dark mode
 * - Avoid collision with the "me" bubble color (blue, oklch(0.45 0.15 250))
 * - Have sufficient contrast on the app background (oklch(0.13 0.01 260))
 */
export const PARTICIPANT_COLORS = [
  "oklch(0.60 0.16 25)", // coral
  "oklch(0.65 0.16 55)", // amber
  "oklch(0.62 0.16 85)", // gold
  "oklch(0.65 0.14 145)", // emerald
  "oklch(0.62 0.12 175)", // teal
  "oklch(0.60 0.12 200)", // cyan
  "oklch(0.55 0.16 275)", // indigo
  "oklch(0.58 0.18 310)", // purple
  "oklch(0.60 0.18 340)", // magenta
  "oklch(0.62 0.16 10)", // rose
  "oklch(0.58 0.14 120)", // lime
  "oklch(0.55 0.14 240)", // steel blue
] as const;

/**
 * Get a participant color by index, wrapping around the palette.
 * Used during import to assign avatarColor to new participants.
 */
export function getParticipantColor(index: number): string {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length]!;
}

/**
 * The "me" bubble color — defined centrally so C2 and other consumers
 * don't hardcode it independently.
 */
export const ME_BUBBLE_COLOR = "oklch(0.45 0.15 250)";

/**
 * The default "other" bubble color for non-group chats
 * (matches --color-bubble-other in globals.css).
 */
export const OTHER_BUBBLE_COLOR = "oklch(0.25 0.01 260)";
