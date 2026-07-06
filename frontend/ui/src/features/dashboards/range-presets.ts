import type { TimeRange } from "./types";

// The dashboard's range presets, shared with the widget builder page (whose
// preview needs its own range once outside the dashboard).
export const RANGE_PRESETS = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
] as const;

export function makeRange(days: number): TimeRange {
  return {
    start: new Date(Date.now() - days * 86_400_000),
    end: new Date(),
  };
}
