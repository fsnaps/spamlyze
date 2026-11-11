import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/firebase-admin";
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
      <h1 className="text-3xl font-semibold tracking-tight">Stats</h1>
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
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
  const paidDeeps = deeps.docs.filter((d) => d.get("status") !== "awaiting_payment").slice(0, 15);

  return (
    <>
      <p className="mt-2 text-sm text-muted">Last 30 days (UTC). Counting started when this page shipped.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Quick Checks" value={String(t.quickChecks)} hint={`${t7.quickChecks} in the last 7 days`} />
        <Tile label="Deep Reports sold" value={String(t.deepPaid)} hint={`${t.deepCheckouts} checkouts opened`} />
        <Tile label="Revenue" value={usd(revenue)} hint={`API cost ${usd(cost)} · net ${usd(revenue - cost)}`} />
        <Tile
          label="Conversion"
          value={pct(t.deepPaid, t.quickChecks)}
          hint={`checkout → paid ${pct(t.deepPaid, t.deepCheckouts)}`}
        />
        <Tile
          label="Email signups"
          value={String(t.signupsWaitlist + t.signupsReport)}
          hint={`${t.signupsReport} from reports`}
        />
        <Tile label="Monitoring interest" value={String(t.signupsMonitoring)} />
        <Tile label="Cached checks" value={String(t.quickChecksCached)} hint="same domain within 24 h" />
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
              {["Day", "Checks", "Checkouts", "Sold", "Revenue", "API cost", "Signups"].map((h) => (
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
                <td className="px-4 py-2">{d.deepCheckouts ?? 0}</td>
                <td className="px-4 py-2">{d.deepPaid ?? 0}</td>
                <td className="px-4 py-2">{usd((d.revenueCents ?? 0) / 100)}</td>
                <td className="px-4 py-2">{usd(apiCostUsd(d))}</td>
                <td className="px-4 py-2">
                  {(d.signupsWaitlist ?? 0) + (d.signupsReport ?? 0) + (d.signupsMonitoring ?? 0)}
                </td>
              </tr>
            ))}
            {!days.length && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={7}>
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
                  {c.get("analysis.riskScore") ?? "–"}/100 · {c.get("createdAt")?.toDate().toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Latest Deep Reports</h2>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
            {paidDeeps.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <a href={`/deep/${d.id}`} className="min-w-0 truncate text-accent underline">
                  {d.get("domain")}
                </a>
                <span className="shrink-0 text-muted">
                  {d.get("status")}
                  {d.get("refunded") ? " · refunded" : ""} · {d.get("email") ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
