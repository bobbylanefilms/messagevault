// ABOUTME: Pure utility functions for the calendar heatmap — level computation, grid layout, and month labels.
// ABOUTME: Handles building the 2D week×day grid, heatmap intensity levels, and color mapping.

/**
 * Heatmap intensity level: 0 (empty) through 4 (highest activity).
 */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

/**
 * A single cell in the heatmap grid.
 */
export interface HeatmapCell {
  dateKey: string;
  day: number;
  count: number;
  level: HeatmapLevel;
}

/**
 * Threshold definitions for the legend display.
 */
export const HEATMAP_THRESHOLDS: { label: string; level: HeatmapLevel }[] = [
  { label: "0", level: 0 },
  { label: "1–5", level: 1 },
  { label: "6–20", level: 2 },
  { label: "21–50", level: 3 },
  { label: "51+", level: 4 },
];

/**
 * Map a message count to a heatmap intensity level.
 */
export function getHeatmapLevel(count: number): HeatmapLevel {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 20) return 2;
  if (count <= 50) return 3;
  return 4;
}

/**
 * Map a heatmap level to its CSS custom property name.
 */
export function getHeatmapColor(level: HeatmapLevel): string {
  if (level === 0) return "var(--color-heatmap-empty)";
  return `var(--color-heatmap-level-${level})`;
}

/**
 * Format a Date as an ISO date key string: "2023-01-15"
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Build a 2D grid of heatmap cells organized by week (columns) and day-of-week (rows).
 * Sunday-start (row 0 = Sunday, row 6 = Saturday).
 * Out-of-year cells are null.
 *
 * @param year - The calendar year to build the grid for.
 * @param statsMap - Map from dateKey to message count.
 * @returns 2D array: weeks[weekIndex][dayOfWeek] = HeatmapCell | null
 */
export function buildHeatmapGrid(
  year: number,
  statsMap: Map<string, number>
): (HeatmapCell | null)[][] {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  // Day of week for Jan 1 (0 = Sunday)
  const startDow = jan1.getDay();

  // Total days in the year
  const totalDays =
    Math.floor(
      (dec31.getTime() - jan1.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  // Number of weeks needed: days covered from start of first week to end of last week
  const totalSlots = startDow + totalDays;
  const numWeeks = Math.ceil(totalSlots / 7);

  // Initialize grid: numWeeks columns × 7 rows
  const grid: (HeatmapCell | null)[][] = [];
  for (let w = 0; w < numWeeks; w++) {
    grid.push(new Array<HeatmapCell | null>(7).fill(null));
  }

  // Fill in cells for each day of the year
  for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
    const date = new Date(year, 0, 1 + dayIndex);
    const dow = date.getDay();
    const weekIndex = Math.floor((startDow + dayIndex) / 7);
    const dateKey = formatDateKey(date);
    const count = statsMap.get(dateKey) ?? 0;

    grid[weekIndex]![dow] = {
      dateKey,
      day: date.getDate(),
      count,
      level: getHeatmapLevel(count),
    };
  }

  return grid;
}

/**
 * Compute month label positions for the heatmap header.
 * Returns the label text and the column (week index) where each month starts.
 */
export function getMonthLabels(
  year: number
): { label: string; col: number }[] {
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const jan1Dow = new Date(year, 0, 1).getDay();
  const labels: { label: string; col: number }[] = [];

  for (let month = 0; month < 12; month++) {
    const firstOfMonth = new Date(year, month, 1);
    const dayOfYear = Math.floor(
      (firstOfMonth.getTime() - new Date(year, 0, 1).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const col = Math.floor((jan1Dow + dayOfYear) / 7);
    labels.push({ label: monthNames[month]!, col });
  }

  return labels;
}
