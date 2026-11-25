// Exports every Quick Check (scores, signals, metrics) with its Search Console verdicts, for
// calibrating the risk score. Read-only. Uses your Google credentials on the production project:
//   gcloud auth application-default login
//   npx tsx --conditions=react-server scripts/export-scores.mts > scores-export.json
process.env.GOOGLE_CLOUD_PROJECT ??= "spamlyze";
const { db } = await import("../src/lib/firebase-admin");

const iso = (t: unknown) => (t && typeof (t as { toDate?: () => Date }).toDate === "function" ? (t as { toDate: () => Date }).toDate().toISOString() : null);

const updatesOf = (gsc: Record<string, unknown> | null | undefined) =>
  gsc && Array.isArray(gsc.updates)
    ? (gsc.updates as Record<string, unknown>[]).map((u) => ({
        name: u.name,
        kind: u.kind,
        verdict: u.verdict,
        clicksChange: u.clicksChange,
        beforeClicks: u.beforeClicks,
        afterClicks: u.afterClicks,
      }))
    : null;

const [checks, imports, deeps] = await Promise.all([
  db().collection("checks").get(),
  db().collection("gscImports").get(),
  db().collection("deepReports").get(),
]);

const gscByCheck = new Map<string, unknown>();
for (const d of imports.docs) {
  const gsc = d.get("gsc") as Record<string, unknown> | null;
  gscByCheck.set(d.get("checkId"), { updates: updatesOf(gsc), lostPages: gsc?.lostPages ?? null, worstUpdate: (gsc?.losers as { update?: string } | null)?.update ?? null });
}

const out = {
  exportedAt: new Date().toISOString(),
  checks: checks.docs.map((d) => ({
    id: d.id,
    domain: d.get("domain"),
    createdAt: iso(d.get("createdAt")),
    source: d.get("source") ?? "site",
    model: d.get("model"),
    robotsBlocked: d.get("robotsBlocked"),
    metrics: d.get("metrics"),
    analysis: d.get("analysis"),
    gscConnected: Boolean(d.get("gscConnectedAt")),
    gsc: gscByCheck.get(d.id) ?? null,
  })),
  deepReports: deeps.docs
    .filter((d) => d.get("status") === "done")
    .map((d) => ({
      id: d.id,
      domain: d.get("domain"),
      test: d.get("test") ?? false,
      createdAt: iso(d.get("createdAt")),
      pagesCrawled: d.get("pagesCrawled") ?? null,
      analysis: d.get("analysis") ? { riskScore: d.get("analysis.riskScore"), riskLevel: d.get("analysis.riskLevel"), signals: d.get("analysis.signals") ?? null } : null,
      metrics: d.get("metrics") ?? null,
      gsc: d.get("gsc") ? { updates: updatesOf(d.get("gsc")), lostPages: d.get("gsc.lostPages") ?? null } : null,
    })),
};
process.stdout.write(JSON.stringify(out, null, 1));
process.exit(0);
