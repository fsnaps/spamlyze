import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/firebase-admin";
import { RerunDeepButton } from "./rerun-deep-button";
import { TestDeepForm } from "./test-deep-form";
import { apiCostUsd, lastDays, STAT_KEYS, type DayStats, type StatKey } from "@/lib/stats";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

function sum(days: DayStats[]) {
  const total = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Record<StatKey, number>;
  for (const d of days) for (const k of STAT_KEYS) total[k] += d[k] ?? 0;
  return total;
}

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
        <span className="flex gap-4 text-sm">
          <a href="/admin/checkouts" className="text-accent underline">
            Checkouts →
          </a>
          <a href="/admin/updates" className="text-accent underline">
            Google updates →
          </a>
          <a href="/admin/api" className="text-accent underline">
            API accounts & keys →
          </a>
          <a href="/api/admin/logout" className="text-muted underline">
            Sign out
          </a>
        </span>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

const AMBER = "bg-amber-500/15 text-amber-800 dark:text-amber-300";
const FAILED: Record<string, string> = { denied: "GSC refused", no_property: "GSC no property", error: "GSC error" };

/** Green when Search Console was connected; amber when someone tried and gave up or it failed. */
function GscBadge({ doc, connected }: { doc: FirebaseFirestore.QueryDocumentSnapshot; connected: boolean }) {
  const failure = doc.get("gscFailure") as string | undefined;
  const [label, title, cls] = connected
    ? ["GSC", "Search Console connected", "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"]
    : failure && FAILED[failure]
      ? [FAILED[failure], "Tried to connect Search Console, it didn't go through", AMBER]
      : doc.get("gscStarts")
        ? ["GSC abandoned", "Clicked Connect Search Console, never came back from Google", AMBER]
        : [null, "", ""];
  if (!label) return null;
  return (
    <span title={title} className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

const HIT: Record<string, [string, string]> = {
  yes: ["hit", "bg-red-500/10 text-red-700 dark:text-red-300"],
  no: ["not hit", "bg-stone-500/10 text-muted"],
  unsure: ["hit?", AMBER],
};

/** The visitor's answer to "Did your traffic drop after a spam update?" (latest one on a shared Quick Check). */
function HitBadge({ doc }: { doc: FirebaseFirestore.QueryDocumentSnapshot }) {
  const h = HIT[doc.get("hitAnswer") as string];
  if (!h) return null;
  return (
    <span title="Did your traffic drop after a spam update?" className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${h[1]}`}>
      {h[0]}
    </span>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

async function Dashboard() {
  await connection();
  const [days, checks, deeps] = await Promise.all([
    lastDays(30),
    db().collection("checks").orderBy("createdAt", "desc").limit(15).get(),
    db().collection("deepReports").orderBy("createdAt", "desc").limit(30).get(),
  ]);
  const t = sum(days);
  const t7 = sum(days.slice(0, 7));
  const revenue = t.revenueCents / 100;
  const cost = apiCostUsd(t);
  // Quick Checks with Search Console connected: flagged on the check, or found among the imports.
  const checkIds = checks.docs.map((c) => c.id);
  const imports = checkIds.length
    ? await db().collection("gscImports").where("checkId", "in", checkIds.slice(0, 30)).select("checkId").get()
    : null;
  const gscChecks = new Set(imports?.docs.map((d) => d.get("checkId") as string));
  for (const c of checks.docs) if (c.get("gscConnectedAt")) gscChecks.add(c.id);
  const paidDeeps = deeps.docs.filter((d) => d.get("status") !== "awaiting_payment").slice(0, 15);
  const listed = checks.docs.length + paidDeeps.length;
  const listedGsc = gscChecks.size + paidDeeps.filter((d) => d.get("gsc")).length;

  return (
    <>
      <p className="mt-2 text-sm text-muted">Last 30 days (UTC). Counting started when this page shipped.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Quick Checks" value={String(t.quickChecks)} hint={`${t7.quickChecks} in the last 7 days · ${t.quickChecksCached} served from cache`} />
        <Tile label="Deep Reports sold" value={String(t.deepPaid)} hint={`${t.deepCheckouts} checkouts opened`} />
        <Tile label="Revenue" value={usd(revenue)} hint={`API cost ${usd(cost)} · net ${usd(revenue - cost)}`} />
        <Tile
          label="Conversion"
          value={pct(t.deepPaid, t.quickChecks)}
          hint={`checkout → paid ${pct(t.deepPaid, t.deepCheckouts)}`}
        />
        <Tile
          label="Email signups"
          value={String(t.signupsWaitlist + t.signupsReport + t.reportEmails)}
          hint={`${t.reportEmails} report emails after a Quick Check (${pct(t.reportEmails, t.quickChecks)}) · ${t.signupsReport} other from reports`}
        />
        <Tile
          label="Search Console connected"
          value={pct(listedGsc, listed)}
          hint={`${listedGsc} of the ${listed} reports below · 30 d: ${t.gscStarts} Connect clicks → ${t.gscConnected} imports, ${t.gscFailed} refused/failed`}
        />
        <Tile
          label="Hit by a spam update?"
          value={`${t.hitYes} yes`}
          hint={`${t.hitNo} no · ${t.hitUnsure} not sure · ${pct(t.hitYes + t.hitNo + t.hitUnsure, t.quickChecks)} of Quick Checks answered`}
        />
        <Tile label="Monitoring / API interest" value={`${t.signupsMonitoring} / ${t.signupsApi}`} />
        <Tile
          label="Errors"
          value={String(t.quickCheckErrors + t.deepFailed)}
          hint={`${t.deepFailed} failed Deep Reports (refunded)`}
        />
      </div>

      <h2 className="mt-12 text-xl font-semibold">By day</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              {["Day", "Checks", "GSC", "Checkouts", "Sold", "Revenue", "API cost", "Signups"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {days.map((d) => (
              <tr key={d.day}>
                <td className="px-4 py-2">{d.day}</td>
                <td className="px-4 py-2">{d.quickChecks ?? 0}</td>
                <td className="px-4 py-2">{d.gscConnected ?? 0}</td>
                <td className="px-4 py-2">{d.deepCheckouts ?? 0}</td>
                <td className="px-4 py-2">{d.deepPaid ?? 0}</td>
                <td className="px-4 py-2">{usd((d.revenueCents ?? 0) / 100)}</td>
                <td className="px-4 py-2">{usd(apiCostUsd(d))}</td>
                <td className="px-4 py-2">
                  {(d.signupsWaitlist ?? 0) + (d.signupsReport ?? 0) + (d.reportEmails ?? 0) + (d.signupsMonitoring ?? 0) + (d.signupsApi ?? 0)}
                </td>
              </tr>
            ))}
            {!days.length && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={8}>
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">Latest Quick Checks</h2>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
            {checks.docs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <a href={`/report/${c.id}`} className="min-w-0 truncate text-accent underline">
                  {c.get("domain")}
                </a>
                <span className="shrink-0 text-muted tabular-nums">
                  <HitBadge doc={c} />
                  <GscBadge doc={c} connected={gscChecks.has(c.id)} />
                  {c.get("analysis.riskScore") ?? "–"}/100 · {c.get("createdAt")?.toDate().toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Latest Deep Reports</h2>
          <TestDeepForm />
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
            {paidDeeps.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <a href={`/deep/${d.id}`} className="min-w-0 truncate text-accent underline">
                  {d.get("domain")}
                </a>
                <span className="shrink-0 text-muted">
                  <HitBadge doc={d} />
                  <GscBadge doc={d} connected={d.get("gsc") != null} />
                  {d.get("test") ? "test · " : ""}
                  {d.get("status")}
                  {d.get("refunded") ? " · refunded" : ""} · {d.get("email") ?? ""}
                  {d.get("status") === "done" && typeof d.get("pagesCrawled") === "number" ? ` · ${d.get("pagesCrawled")} p.` : ""}
                  {(d.get("status") === "done" || d.get("status") === "failed") && <RerunDeepButton id={d.id} />}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
