/**
 * Google ranking updates, from the Google Search Status Dashboard
 * (https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history).
 * Add new ones here when Google announces them. `end` is null while rolling out.
 */
export type RankingUpdate = { name: string; kind: "spam" | "core" | "other"; start: string; end: string | null };

export const UPDATES: RankingUpdate[] = [
  { name: "November 2026 core update", kind: "core", start: "2026-11-10", end: null },
  { name: "September 2026 spam update", kind: "spam", start: "2026-09-24", end: "2026-10-07" },
  { name: "August 2026 spam update", kind: "spam", start: "2026-08-18", end: "2026-08-20" },
  { name: "June 2026 spam update", kind: "spam", start: "2026-06-24", end: "2026-06-26" },
  { name: "May 2026 core update", kind: "core", start: "2026-05-21", end: "2026-06-01" },
  { name: "March 2026 core update", kind: "core", start: "2026-03-27", end: "2026-04-08" },
  { name: "March 2026 spam update", kind: "spam", start: "2026-03-24", end: "2026-03-24" },
  { name: "December 2025 core update", kind: "core", start: "2025-12-11", end: "2025-12-29" },
  { name: "August 2025 spam update", kind: "spam", start: "2025-08-26", end: "2025-09-21" },
  { name: "June 2025 core update", kind: "core", start: "2025-06-30", end: "2025-07-16" },
  { name: "March 2025 core update", kind: "core", start: "2025-03-13", end: "2025-03-26" },
];
