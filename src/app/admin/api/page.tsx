import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { accounts, type ApiAccount } from "@/lib/api/accounts";
import { apiEnabled } from "@/lib/api/config";
import { ipFromField, type ApiKeyDoc } from "@/lib/api/keys";
import { lastDays, today, type DayStats } from "@/lib/stats";
import { addCreditsAction, revokeKeyAction, setAccountStatusAction } from "./actions";

export const metadata: Metadata = { title: "Admin · API", robots: { index: false, follow: false } };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const DAY = 86_400_000;
const ago = (t: Timestamp | null | undefined) => {
  if (!t) return "never";
  const ms = Date.now() - t.toMillis();
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (ms < DAY) return `${Math.round(ms / 3_600_000)} h ago`;
  return `${Math.round(ms / DAY)} d ago`;
};

export default function ApiAdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">API</h1>
        <a href="/admin" className="text-sm text-muted underline">
          ← Stats
        </a>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <ApiDashboard />
      </Suspense>
    </main>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-surface p-5 ${warn ? "border-amber-500/60" : "border-line"}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const BADGE = {
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  grey: "bg-stone-500/10 text-muted",
};
function Badge({ tone, children, title }: { tone: keyof typeof BADGE; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`mr-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[tone]}`}>
      {children}
    </span>
  );
}

type Key = ApiKeyDoc & { keyId: string };

/** Security flags for one key, worst first. */
function keyFlags(k: Key): { tone: keyof typeof BADGE; label: string; title: string }[] {
  if (k.revokedAt) return [{ tone: "grey", label: "revoked", title: `Revoked ${ago(k.revokedAt)}` }];
  const now = Date.now();
  const flags: { tone: keyof typeof BADGE; label: string; title: string }[] = [];
  const ips24 = Object.values(k.ips ?? {}).filter((t) => now - t.toMillis() < DAY).length;
  if (ips24 > 3) flags.push({ tone: "red", label: `${ips24} IPs in 24 h`, title: "Used from many addresses: possible leak. Check with the client, revoke if unsure." });
  if (k.rateLimitedAt && now - k.rateLimitedAt.toMillis() < DAY) flags.push({ tone: "amber", label: "rate-limited", title: `Hit the rate limit ${ago(k.rateLimitedAt)}` });
  const created = k.createdAt?.toMillis() ?? now;
  if (!k.lastUsedAt && now - created > 7 * DAY) flags.push({ tone: "amber", label: "never used", title: "Created over 7 days ago and never used: revoke it if it isn't needed." });
  else if (k.lastUsedAt && now - k.lastUsedAt.toMillis() > 30 * DAY) flags.push({ tone: "amber", label: "idle 30 d", title: "Unused for 30 days: revoke it if it isn't needed." });
  if (!flags.length) flags.push({ tone: "green", label: "ok", title: "No warning" });
  return flags;
}

async function ApiDashboard() {
  await connection();
  const day = today();
  const [days, acctSnap, keySnap, recent] = await Promise.all([
    lastDays(30),
    accounts().orderBy("createdAt", "desc").limit(200).get(),
    db().collection("apiKeys").orderBy("createdAt", "desc").limit(500).get(),
    db().collection("checks").orderBy("createdAt", "desc").limit(100).get(),
  ]);
  const usageSnaps = acctSnap.empty
    ? []
    : await db().getAll(...acctSnap.docs.map((a) => a.ref.collection("usage").doc(day)));
  const spentToday = new Map(usageSnaps.map((u) => [u.ref.parent.parent!.id, (u.get("spentCents") as number) ?? 0]));

  const sum = (k: keyof DayStats, list = days) => list.reduce((s, d) => s + ((d[k] as number) ?? 0), 0);
  const keys: Key[] = keySnap.docs.map((d) => ({ keyId: d.id, ...(d.data() as ApiKeyDoc) }));
  const keysByAccount = new Map<string, Key[]>();
  for (const k of keys) keysByAccount.set(k.accountId, [...(keysByAccount.get(k.accountId) ?? []), k]);
  const accts = acctSnap.docs.map((d) => ({ id: d.id, ...(d.data() as ApiAccount) }));
  const names = new Map(accts.map((a) => [a.id, a.name]));
  const active = keys.filter((k) => !k.revokedAt);
  const flagged = active.filter((k) => keyFlags(k).some((f) => f.tone === "red" || f.tone === "amber"));
  const balances = accts.reduce((s, a) => s + (a.balanceCents ?? 0), 0);
  const apiChecks = recent.docs.filter((c) => c.get("source") === "api").slice(0, 15);

  return (
    <>
      <p className="mt-2 text-sm text-muted">
        API is {apiEnabled() ? <strong>open to everyone</strong> : <strong>closed (beta accounts only)</strong>}. Last 30 days, UTC.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Accounts" value={String(accts.length)} hint={`${accts.filter((a) => a.status === "suspended").length} suspended · ${accts.filter((a) => a.beta).length} beta`} />
        <Tile label="Active keys" value={String(active.length)} hint={`${keys.length - active.length} revoked`} />
        <Tile label="Prepaid balances" value={usd(balances)} hint="Credits sold but not used yet" />
        <Tile label="API spend" value={usd(sum("apiChargedCents") - sum("apiRefundedCents"))} hint={`${usd(sum("apiRefundedCents"))} refunded · today ${usd(days[0]?.day === day ? (days[0].apiChargedCents ?? 0) - (days[0].apiRefundedCents ?? 0) : 0)}`} />
        <Tile label="API Quick Checks" value={String(sum("apiQuickChecks"))} hint={`${sum("apiQuickChecks", days.slice(0, 7))} in the last 7 days`} />
        <Tile label="Keys to look at" value={String(flagged.length)} warn={flagged.length > 0} hint="Many IPs, rate-limited, unused or idle" />
        <Tile label="Rejected keys" value={String(sum("apiAuthFailures"))} warn={sum("apiAuthFailures", days.slice(0, 1)) > 50} hint={`Calls with an invalid or revoked key · today ${sum("apiAuthFailures", days.slice(0, 1))}`} />
        <Tile label="Rate-limited calls" value={String(sum("apiRateLimited"))} hint={`today ${sum("apiRateLimited", days.slice(0, 1))}`} />
      </div>

      <h2 className="mt-12 text-xl font-semibold">Accounts</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              {["Account", "Balance", "Today / cap", "Keys", "Last used", "Actions"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {accts.map((a) => {
              const ks = keysByAccount.get(a.id) ?? [];
              const last = ks.map((k) => k.lastUsedAt).filter(Boolean).sort((x, y) => y!.toMillis() - x!.toMillis())[0];
              const spent = spentToday.get(a.id) ?? 0;
              return (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-2">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted">{a.email} · {a.id}</p>
                    <p className="mt-1">
                      {a.status === "suspended" && <Badge tone="red">suspended</Badge>}
                      {a.beta && <Badge tone="grey">beta</Badge>}
                    </p>
                  </td>
                  <td className="px-4 py-2">{usd(a.balanceCents ?? 0)}</td>
                  <td className="px-4 py-2">
                    {usd(spent)} / {usd(a.dailySpendCapCents ?? 0)}
                    {spent >= (a.dailySpendCapCents ?? 0) * 0.8 && spent > 0 && <Badge tone="amber">near cap</Badge>}
                  </td>
                  <td className="px-4 py-2">{ks.filter((k) => !k.revokedAt).length} active</td>
                  <td className="px-4 py-2">{ago(last)}</td>
                  <td className="px-4 py-2">
                    <form action={addCreditsAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="accountId" value={a.id} />
                      <input name="usd" type="number" min="1" max="5000" step="1" placeholder="$" required className="w-16 rounded border border-line bg-transparent px-1 py-0.5" />
                      <input name="note" placeholder="note" className="w-24 rounded border border-line bg-transparent px-1 py-0.5" />
                      <button className="rounded border border-line px-2 py-0.5">Add credits</button>
                    </form>
                    <form action={setAccountStatusAction} className="mt-1">
                      <input type="hidden" name="accountId" value={a.id} />
                      <input type="hidden" name="status" value={a.status === "suspended" ? "active" : "suspended"} />
                      <button className="text-xs text-muted underline">{a.status === "suspended" ? "Reactivate" : "Suspend all keys"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!accts.length && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={6}>
                  No API account yet. Create one with <code>npm run api -- create-account</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-xl font-semibold">Keys</h2>
      <p className="mt-1 text-sm text-muted">Only a hash of each key is stored. Hover a badge for details.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              {["Key", "Account", "Security", "Last used", "IPs (30 d)", "Created", ""].map((h, i) => (
                <th key={i} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {keys.map((k) => {
              const ips = Object.entries(k.ips ?? {})
                .filter(([, t]) => Date.now() - t.toMillis() < 30 * DAY)
                .sort(([, a], [, b]) => b.toMillis() - a.toMillis());
              return (
                <tr key={k.keyId} className={`align-top ${k.revokedAt ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2">
                    <code className="text-xs">{k.hint}</code>
                    <p className="text-xs text-muted">{k.name}</p>
                  </td>
                  <td className="px-4 py-2">{names.get(k.accountId) ?? k.accountId}</td>
                  <td className="px-4 py-2">
                    {keyFlags(k).map((f) => (
                      <Badge key={f.label} tone={f.tone} title={f.title}>{f.label}</Badge>
                    ))}
                  </td>
                  <td className="px-4 py-2">
                    {ago(k.lastUsedAt)}
                    {k.lastUsedIp && <p className="text-xs text-muted">{k.lastUsedIp}</p>}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted" title={ips.map(([f, t]) => `${ipFromField(f)} · ${ago(t)}`).join("\n")}>
                    {ips.length}
                  </td>
                  <td className="px-4 py-2 text-xs">{k.createdAt?.toDate().toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2">
                    {!k.revokedAt && (
                      <form action={revokeKeyAction}>
                        <input type="hidden" name="keyId" value={k.keyId} />
                        <button className="rounded border border-red-500/40 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!keys.length && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={7}>No key yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-xl font-semibold">Latest API Quick Checks</h2>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
        {apiChecks.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <a href={`/report/${c.id}`} className="min-w-0 truncate text-accent underline">{c.get("domain")}</a>
            <span className="shrink-0 text-muted tabular-nums">
              {names.get(c.get("accountId")) ?? c.get("accountId")} · {c.get("analysis.riskScore") ?? "–"}/100 ·{" "}
              {c.get("createdAt")?.toDate().toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </li>
        ))}
        {!apiChecks.length && <li className="px-4 py-6 text-muted">None yet.</li>}
      </ul>
    </>
  );
}
