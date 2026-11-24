import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";

/**
 * Where a risk score sits among all the sites analysed on Spamlyze.
 *
 * Kept cheap with two kinds of documents:
 * - aggregates/riskScores: { counts: number[101], total } — how many sites have each score.
 *   The report page reads only this one document.
 * - riskScoreByDomain/{domain}: { score } — each site's latest score, so a site checked twice
 *   counts once, with its newest score.
 * Both are built from the `checks` collection the first time they're needed, then kept up to
 * date by every new Quick Check (site or API).
 */

const aggregate = () => db().collection("aggregates").doc("riskScores");
const domainDoc = (domain: string) => db().collection("riskScoreByDomain").doc(domain.slice(0, 200));

const clampScore = (s: number) => Math.max(0, Math.min(100, Math.round(s)));

export type Benchmark = {
  /** Sites analysed so far (one per domain). */
  total: number;
  /** Sites with a strictly lower score. */
  lower: number;
  /** Sites with a strictly higher score. */
  higher: number;
  /** Where the marker goes on a safest → riskiest bar, 0-100 (mid-rank for ties). */
  position: number;
};

/** Records a site's newest score. Never throws: the benchmark must not break a check. */
export async function recordRiskScore(domain: string, score: number): Promise<void> {
  try {
    await db().runTransaction(async (tx) => {
      const [agg, dom] = await tx.getAll(aggregate(), domainDoc(domain));
      // Not built yet: the first read builds it from `checks`, this check included.
      if (!agg.exists) return;
      const counts = [...((agg.get("counts") as number[]) ?? [])];
      while (counts.length < 101) counts.push(0);
      let total = (agg.get("total") as number) ?? 0;
      const prev = dom.exists ? (dom.get("score") as number) : null;
      if (prev !== null && counts[prev] > 0) counts[prev]--;
      else total++;
      counts[clampScore(score)]++;
      tx.set(aggregate(), { counts, total, updatedAt: FieldValue.serverTimestamp() });
      tx.set(domainDoc(domain), { score: clampScore(score), updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    console.error("benchmark update failed", err instanceof Error ? err.message : err);
  }
}

/** Builds both documents from every stored check, keeping each domain's latest score. */
export async function rebuildBenchmark(): Promise<number[]> {
  const snap = await db().collection("checks").select("domain", "createdAt", "analysis.riskScore").get();
  const latest = new Map<string, { at: number; score: number }>();
  for (const d of snap.docs) {
    const score = d.get("analysis.riskScore");
    const domain = d.get("domain");
    if (typeof score !== "number" || typeof domain !== "string") continue;
    const at = d.get("createdAt")?.toMillis?.() ?? 0;
    const prev = latest.get(domain);
    if (!prev || at >= prev.at) latest.set(domain, { at, score: clampScore(score) });
  }
  const counts = Array.from({ length: 101 }, () => 0);
  for (const { score } of latest.values()) counts[score]++;

  const writer = db().bulkWriter();
  for (const [domain, { score }] of latest) {
    void writer.set(domainDoc(domain), { score, updatedAt: FieldValue.serverTimestamp() });
  }
  void writer.set(aggregate(), { counts, total: latest.size, updatedAt: FieldValue.serverTimestamp() });
  await writer.close();
  return counts;
}

/** Pure ranking, from the per-score counts. */
export function rankIn(counts: number[], score: number): Benchmark | null {
  const s = clampScore(score);
  let total = 0;
  let lower = 0;
  let same = 0;
  counts.forEach((n, i) => {
    total += n;
    if (i < s) lower += n;
    else if (i === s) same += n;
  });
  if (total < 2) return null;
  const higher = total - lower - same;
  // Mid-rank, so a tie with many sites doesn't push the marker to an end of the bar.
  const position = Math.max(2, Math.min(98, ((lower + same / 2) / total) * 100));
  return { total, lower, higher, position };
}

/** Where `score` sits among all analysed sites, or null if unavailable. Never throws. */
export async function benchmarkFor(score: number): Promise<Benchmark | null> {
  try {
    const snap = await aggregate().get();
    const counts = snap.exists ? ((snap.get("counts") as number[]) ?? []) : await rebuildBenchmark();
    return rankIn(counts, score);
  } catch (err) {
    console.error("benchmark read failed", err instanceof Error ? err.message : err);
    return null;
  }
}

const pct = (n: number, total: number) => Math.round((n / total) * 100);

/** "Riskier than 70% of" or "Lower risk than 85% of", followed by "the N sites analysed on Spamlyze". */
export function rankHeadline(b: Benchmark): { lead: string; percent: number; risky: boolean } {
  const riskierThan = pct(b.lower, b.total);
  const saferThan = pct(b.higher, b.total);
  return riskierThan >= saferThan
    ? { lead: "Riskier than", percent: riskierThan, risky: true }
    : { lead: "Lower risk than", percent: saferThan, risky: false };
}

export const rankSentence = (b: Benchmark) => {
  const h = rankHeadline(b);
  return `${h.lead} ${h.percent}% of the ${b.total.toLocaleString("en-US")} sites analysed on Spamlyze`;
};
