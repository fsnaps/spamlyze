// Re-scores sites already checked, with the current scoring, to compare with their stored score.
// Crawls each site again and calls Claude (Haiku by default, ~$0.01 per site). Writes nothing to
// Firestore. Input: the file written by scripts/export-scores.mts.
//   ANTHROPIC_API_KEY=... npx tsx --conditions=react-server scripts/replay-scores.mts scores-export.json > replay-results.json
import { readFileSync } from "node:fs";

type Exported = {
  checks: {
    domain: string;
    url?: string;
    createdAt: string | null;
    analysis: { riskScore: number; signals: { id: string; score: number }[] } | null;
  }[];
};

const file = process.argv[2] ?? "scores-export.json";
const data = JSON.parse(readFileSync(file, "utf8")) as Exported;

// Latest stored check per domain.
const latest = new Map<string, Exported["checks"][number]>();
for (const c of data.checks) {
  if (!c.analysis) continue;
  const prev = latest.get(c.domain);
  if (!prev || (c.createdAt ?? "") > (prev.createdAt ?? "")) latest.set(c.domain, c);
}

const { crawl } = await import("../src/lib/check/crawl");
const { computeMetrics } = await import("../src/lib/check/metrics");
const { analyze } = await import("../src/lib/check/analyze");
const { mapLimit } = await import("../src/lib/check/crawl");

const bySignal = (signals: { id: string; score: number }[]) => Object.fromEntries(signals.map((s) => [s.id, s.score]));

const results = await mapLimit([...latest.values()], 3, async (c) => {
  try {
    const result = await crawl(new URL(`https://${c.domain}/`));
    if (result.robotsBlocked) return { domain: c.domain, error: "robots" };
    const metrics = computeMetrics(result);
    const { analysis } = await analyze(result, metrics);
    const row = {
      domain: c.domain,
      before: c.analysis!.riskScore,
      after: analysis.riskScore,
      level: analysis.riskLevel,
      signalsBefore: bySignal(c.analysis!.signals),
      signalsAfter: bySignal(analysis.signals),
      urlSeries: metrics.urlSeries?.map((s) => `${s.pattern} ~${s.estimatedPages}`),
      estimatedThinPages: metrics.estimatedThinPages,
      summary: analysis.summary,
      findings: Object.fromEntries(analysis.signals.map((s) => [s.id, s.finding])),
    };
    console.error(`${c.domain.padEnd(32)} ${String(row.before).padStart(3)} → ${String(row.after).padStart(3)} ${row.level}`);
    return row;
  } catch (err) {
    console.error(`${c.domain.padEnd(32)} failed: ${err instanceof Error ? err.message : err}`);
    return { domain: c.domain, error: err instanceof Error ? err.message : String(err) };
  }
});

process.stdout.write(JSON.stringify(results, null, 1));
process.exit(0);
