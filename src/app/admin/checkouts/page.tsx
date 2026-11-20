import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";

export const metadata: Metadata = { title: "Admin · Checkouts", robots: { index: false, follow: false } };

const DAY = 86_400_000;
const when = (t: Timestamp | null | undefined) => {
  if (!t) return "–";
  const ms = Date.now() - t.toMillis();
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (ms < DAY) return `${Math.round(ms / 3_600_000)} h ago`;
  return t.toDate().toISOString().slice(0, 10);
};

const REASONS: Record<string, string> = {
  challenge: "anti-bot firewall",
  robots: "robots.txt",
  unreachable: "unreachable",
};

export default function CheckoutsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Checkouts</h1>
        <a href="/admin" className="text-sm text-muted underline">
          ← Stats
        </a>
      </div>
      <Suspense fallback={<p className="mt-8 text-muted">Loading…</p>}>
        <Lists />
      </Suspense>
    </main>
  );
}

async function Lists() {
  await connection();
  const [deeps, blocks] = await Promise.all([
    // Recent reports, all statuses: filtered here to avoid a composite index.
    db().collection("deepReports").orderBy("createdAt", "desc").limit(300).get(),
    db().collection("checkoutBlocks").orderBy("createdAt", "desc").limit(50).get(),
  ]);
  const paidAt = new Map<string, number>();
  for (const d of deeps.docs) {
    if (d.get("status") === "awaiting_payment" || d.get("test")) continue;
    const t = (d.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0;
    paidAt.set(d.get("domain"), Math.max(paidAt.get(d.get("domain")) ?? 0, t));
  }
  const abandoned = deeps.docs.filter((d) => d.get("status") === "awaiting_payment").slice(0, 50);

  return (
    <div className="mt-8 space-y-12">
      <section>
        <h2 className="text-xl font-semibold">Abandoned payments ({abandoned.length})</h2>
        <p className="mt-1 text-sm text-muted">
          Stripe checkout opened, never paid. &quot;Bought later&quot; means a paid report for the same domain came after.
        </p>
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
          {abandoned.length === 0 && <li className="px-4 py-3 text-muted">None.</li>}
          {abandoned.map((d) => {
            const created = (d.get("createdAt") as Timestamp | undefined)?.toMillis() ?? 0;
            const later = (paidAt.get(d.get("domain")) ?? 0) > created;
            const count = d.get("sitemapUrlCountAtCheckout") as number | null | undefined;
            const price = d.get("priceCents") as number | undefined;
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate font-medium">{d.get("domain")}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  {later && (
                    <span className="mr-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      bought later
                    </span>
                  )}
                  {d.get("maxPages") ? `${d.get("maxPages")} p.` : ""}
                  {typeof price === "number" ? ` · $${(price / 100).toFixed(2)}` : ""}
                  {count != null ? ` · sitemap ${count.toLocaleString("en-US")}` : " · no sitemap"} · {when(d.get("createdAt"))}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Sites we couldn&apos;t crawl ({blocks.size})</h2>
        <p className="mt-1 text-sm text-muted">Refused before payment, so nobody was charged. Kept 90 days, listed since this page shipped.</p>
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
          {blocks.empty && <li className="px-4 py-3 text-muted">None.</li>}
          {blocks.docs.map((b) => (
            <li key={b.id} className="px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{b.get("domain")}</span>
                <span className="shrink-0 text-muted">
                  {REASONS[b.get("reason")] ?? b.get("reason")}
                  {b.get("source") === "api" ? " · API" : ""} · {when(b.get("createdAt"))}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{b.get("message")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
