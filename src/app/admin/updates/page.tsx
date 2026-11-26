import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRankingUpdates, getSyncState, rankingCronToken } from "@/lib/gsc/update-feed";
import { STATUS_DASHBOARD_URL, statusOf } from "@/lib/gsc/updates";
import { syncNowAction } from "./actions";

export const metadata: Metadata = { title: "Admin · Google updates", robots: { index: false, follow: false } };

const STATUS: Record<string, { label: string; cls: string }> = {
  announced: { label: "Announced", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  rolling: { label: "Rolling out", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  done: { label: "Done", cls: "bg-stone-500/10 text-muted" },
};
const KIND: Record<string, string> = {
  spam: "bg-red-500/10 text-red-700 dark:text-red-300",
  core: "bg-stone-500/15 text-foreground",
  other: "bg-stone-500/10 text-muted",
};

export default function UpdatesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Google updates</h1>
        <a href="/admin" className="text-sm text-muted underline">
          ← Stats
        </a>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  await connection();
  const [updates, state] = await Promise.all([getRankingUpdates(), getSyncState()]);
  let token = "";
  try {
    token = rankingCronToken();
  } catch {
    token = "<API_KEY_PEPPER is not set>";
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Synced from{" "}
        <a href={STATUS_DASHBOARD_URL} target="_blank" rel="noopener" className="underline">
          Google&apos;s Search Status Dashboard
        </a>{" "}
        (Ranking). Last successful sync: {state.lastOkAt ? state.lastOkAt.slice(0, 16).replace("T", " ") + " UTC" : "never"}.
        {state.lastError && state.lastRunAt !== state.lastOkAt && (
          <span className="text-red-700 dark:text-red-300"> Last run failed: {state.lastError}</span>
        )}
      </p>
      <form action={syncNowAction} className="mt-3">
        <button className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold hover:border-foreground/40">Sync now</button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="p-3 font-medium">Update</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Start</th>
              <th className="p-3 font-medium">End</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {updates.map((u) => {
              const s = STATUS[statusOf(u)];
              return (
                <tr key={u.name}>
                  <td className="p-3 font-medium">
                    {u.name}
                    {!u.id && <span className="ml-2 text-xs font-normal text-muted">(seed, no longer in the feed)</span>}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${KIND[u.kind]}`}>{u.kind}</span>
                  </td>
                  <td className="p-3 tabular-nums">{statusOf(u) === "announced" ? `announced ${u.start}` : u.start}</td>
                  <td className="p-3 tabular-nums">{u.end ?? "–"}</td>
                  <td className="p-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Scheduled sync (Cloud Scheduler)</h2>
      <p className="mt-2 text-sm text-muted">
        Without it, the list still refreshes on the first visit after 24 hours. With it, a new update is picked up within 6
        hours and you get an email. One-time setup:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed">
        {`gcloud services enable cloudscheduler.googleapis.com --project=spamlyze
gcloud scheduler jobs create http ranking-updates \\
  --project=spamlyze --location=europe-west1 \\
  --schedule="15 */6 * * *" --time-zone="Europe/Brussels" \\
  --uri="https://spamlyze.com/api/internal/ranking-updates" --http-method=POST \\
  --headers="x-spamlyze-cron=${token}" \\
  --attempt-deadline=60s`}
      </pre>
    </>
  );
}
