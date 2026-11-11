import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";

/** Daily counters, stored in stats/{YYYY-MM-DD} (UTC). */
export const STAT_KEYS = [
  "quickChecks",
  "quickChecksCached",
  "quickCheckErrors",
  "deepCheckouts",
  "deepPaid",
  "revenueCents",
  "deepDone",
  "deepFailed",
  "signupsWaitlist",
  "signupsReport",
  "signupsMonitoring",
  "haikuInputTokens",
  "haikuOutputTokens",
  "opusInputTokens",
  "opusOutputTokens",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type DayStats = Partial<Record<StatKey, number>> & { day: string };

export const today = () => new Date().toISOString().slice(0, 10);

/** Adds to today's counters. Never throws: stats must not break the product. */
export async function track(fields: Partial<Record<StatKey, number>>): Promise<void> {
  const inc: Record<string, unknown> = { day: today() };
  for (const [k, v] of Object.entries(fields)) if (v) inc[k] = FieldValue.increment(v);
  try {
    await db().collection("stats").doc(today()).set(inc, { merge: true });
  } catch (err) {
    console.error("stats write failed", err instanceof Error ? err.message : err);
  }
}

export async function lastDays(n: number): Promise<DayStats[]> {
  const snap = await db().collection("stats").orderBy("day", "desc").limit(n).get();
  return snap.docs.map((d) => d.data() as DayStats);
}

// Per million tokens, in USD (Haiku 5.5 and Opus 5.5 list prices).
export const PRICES = { haiku: { input: 0.1, output: 0.5 }, opus: { input: 4, output: 20 } };

export function apiCostUsd(s: Partial<Record<StatKey, number>>): number {
  return (
    ((s.haikuInputTokens ?? 0) * PRICES.haiku.input +
      (s.haikuOutputTokens ?? 0) * PRICES.haiku.output +
      (s.opusInputTokens ?? 0) * PRICES.opus.input +
      (s.opusOutputTokens ?? 0) * PRICES.opus.output) /
    1_000_000
  );
}
