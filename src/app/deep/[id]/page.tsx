import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DeepRunner } from "@/components/deep-runner";
import { GSC_MESSAGES, GscSection } from "@/components/gsc-section";
import { gscEnabled } from "@/lib/gsc/oauth";
import { PrintButton } from "@/components/print-button";
import { PurchaseTracker } from "@/components/purchase-tracker";
import { deepPricing } from "@/lib/pricing";
import { ScoreGauge } from "@/components/score-gauge";
import { confirmPayment, getDeepPages, getDeepReport, isDeepId } from "@/lib/deep/job";
import { publicStatus } from "@/lib/deep/status";
import type { DeepPage, DeepReport } from "@/lib/deep/types";
import { pageKey } from "@/lib/gsc/data";

export const metadata: Metadata = {
  title: "Deep Report",
  robots: { index: false, follow: false },
};

const SIGNAL_LABELS: Record<string, string> = {
  scaled_content: "Scaled content",
  thin_doorway: "Thin and doorway pages",
  site_reputation_abuse: "Site reputation abuse",
  link_schemes: "Link schemes",
  expired_domain: "Expired domain signals",
  general: "General",
};

const LEVEL_STYLES: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ok: "bg-stone-500/10 text-muted",
  moderate: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  weak: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  high: "bg-red-500/10 text-red-700 dark:text-red-300",
  spammy: "bg-red-500/10 text-red-700 dark:text-red-300",
  now: "bg-red-500/10 text-red-700 dark:text-red-300",
  next: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  later: "bg-stone-500/10 text-muted",
  unknown: "bg-stone-500/10 text-muted",
};

function Badge({ value, prefix = "" }: { value: string; prefix?: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${LEVEL_STYLES[value] ?? LEVEL_STYLES.unknown}`}
    >
      {prefix}
      {value}
    </span>
  );
}

function UrlList({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {urls.map((u) => (
        <li key={u} className="truncate">
          <a href={u} rel="nofollow noopener" target="_blank" className="text-accent underline">
            {u.replace(/^https?:\/\//, "")}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function DeepReportPage({ params, searchParams }: PageProps<"/deep/[id]">) {
  return (
    <Suspense
      fallback={<main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 text-muted sm:px-6">Loading report…</main>}
    >
      <DeepView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DeepView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Firestore and Stripe clients use random ids: render at request time only.
  await connection();
  const query = await searchParams;
  const sessionId = query.session_id;
  const gscResult = typeof query.gsc === "string" ? query.gsc : undefined;
  const { id } = await params;
  if (!isDeepId(id)) notFound();
  let report = await getDeepReport(id);
  if (!report) notFound();

  if (report.status === "awaiting_payment" && typeof sessionId === "string" && sessionId.startsWith("cs_")) {
    try {
      if (await confirmPayment(id, sessionId)) report = (await getDeepReport(id))!;
    } catch (err) {
      console.error("deep: payment confirmation failed", err instanceof Error ? err.message : err);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
      <p className="text-sm text-muted">Deep Report{report.maxPages ? ` · up to ${report.maxPages} pages` : ""}</p>
      <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{report.domain}</h1>
      {report.status !== "awaiting_payment" && typeof sessionId === "string" && (
        <PurchaseTracker id={id} value={(report.priceCents ?? deepPricing().cents) / 100} />
      )}
      <div className="mt-8">
        {report.status === "awaiting_payment" ? (
          <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Waiting for payment confirmation</h2>
            <p className="mt-2 text-muted">
              If you just paid, refresh this page in a few seconds. If it stays here, write to{" "}
              <a className="text-accent underline" href="mailto:hello@spamlyze.com">
                hello@spamlyze.com
              </a>{" "}
              with this page&apos;s address.
            </p>
          </div>
        ) : report.status === "done" ? (
          <FinishedReport id={id} report={report} gscResult={gscResult} />
        ) : (
          <>
            {report.status === "running" && <GscWhileRunning id={id} report={report} result={gscResult} />}
            <DeepRunner id={id} host={report.domain} initial={publicStatus(report)} />
          </>
        )}
      </div>
    </main>
  );
}

/** Offers Search Console while the job runs, so the pages that lost clicks are reviewed first. */
function GscWhileRunning({ id, report, result }: { id: string; report: DeepReport; result?: string }) {
  if (!gscEnabled() && !report.gsc) return null;
  const message = result && result !== "connected" ? GSC_MESSAGES[result] : null;
  if (report.gsc) {
    const losers = report.gsc.losers;
    return (
      <div id="search-console" className="mb-6 scroll-mt-8 rounded-2xl border border-line bg-surface p-6" role="status">
        <p className="font-semibold">Search Console connected</p>
        <p className="mt-1 text-muted">
          {losers && (report.gsc.lostPages ?? 0) > 0
            ? `${report.gsc.lostPages} pages lost clicks after the ${losers.update}. We review them first and build your action plan around them.`
            : "No clear traffic drop after recent Google updates. Your traffic history will be in the report."}
        </p>
      </div>
    );
  }
  return (
    <div id="search-console" className="mb-6 scroll-mt-8 rounded-2xl border-2 border-accent bg-surface p-6">
      {message && <p className="mb-4 rounded-xl border border-line px-4 py-3 text-sm">{message}</p>}
      <p className="font-semibold">Recommended: connect Search Console while we work</p>
      <p className="mt-2 leading-relaxed text-muted">
        We&apos;ll find the pages that lost clicks after Google&apos;s spam and core updates, review those first, and
        tie your action plan to your real traffic losses. Read-only, used once, and we don&apos;t keep access to your
        account.
      </p>
      <a
        href={`/api/gsc/connect?deep=${id}`}
        className="mt-5 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 font-semibold text-white"
      >
        Connect Search Console
      </a>
      <p className="mt-3 text-xs text-muted">Optional. The analysis keeps running either way.</p>
    </div>
  );
}

async function FinishedReport({ id, report, gscResult }: { id: string; report: DeepReport; gscResult?: string }) {
  const a = report.analysis;
  if (report.robotsBlocked || !a) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-6 text-muted">
        Your robots.txt blocks crawlers from your homepage, so we couldn&apos;t analyze the site. Allow SpamlyzeBot (or
        all crawlers) and write to hello@spamlyze.com: we&apos;ll run your report again for free.
      </p>
    );
  }
  const pages = await getDeepPages(id);
  const counts = { good: 0, ok: 0, weak: 0, spammy: 0 } as Record<string, number>;
  for (const p of pages) if (p.verdict) counts[p.verdict.quality] = (counts[p.verdict.quality] ?? 0) + 1;
  const flagged = pages
    .filter((p): p is DeepPage & { verdict: NonNullable<DeepPage["verdict"]> } =>
      Boolean(p.verdict && (p.verdict.quality === "weak" || p.verdict.quality === "spammy")),
    )
    .sort((x, y) => (x.verdict.quality === y.verdict.quality ? 0 : x.verdict.quality === "spammy" ? -1 : 1));
  const date = report.finishedAt?.toDate?.().toLocaleDateString("en-US", { dateStyle: "medium" }) ?? "";
  const losses = new Map((report.gscLosses ?? []).map((l) => [pageKey(l.url), l]));
  const verdicts = new Map(pages.filter((p) => p.verdict).map((p) => [pageKey(p.url), p.verdict!.quality]));
  // Pages that lost clicks come first among the ones to review.
  flagged.sort((x, y) => Number(losses.has(pageKey(y.url))) - Number(losses.has(pageKey(x.url))));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {pages.length} pages reviewed
          {report.sitemapUrlCount ? ` of ${report.sitemapUrlCount.toLocaleString("en-US")} in your sitemap` : ""} · {date}
        </p>
        <PrintButton />
      </div>
      <Coverage report={report} losingReviewed={pages.filter((p) => losses.has(pageKey(p.url))).length} />

      <section className="sl-fade-up mt-6 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center">
        <div className="shrink-0 text-center sm:w-40">
          <ScoreGauge score={a.riskScore} level={a.riskLevel} />
          <p className="-mt-3 text-sm text-muted">risk score</p>
          <div className="mt-2">
            <Badge value={a.riskLevel} />
          </div>
        </div>
        <div>
          <p className="leading-relaxed">{a.summary}</p>
          <dl className="mt-5 grid grid-cols-4 gap-2 text-center text-sm">
            {(["good", "ok", "weak", "spammy"] as const).map((q) => (
              <div key={q} className="rounded-xl border border-line p-2">
                <dt className="capitalize text-muted">{q}</dt>
                <dd className="text-lg font-semibold tabular-nums">{counts[q] ?? 0}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Action plan</h2>
        <ol className="mt-6 space-y-4">
          {a.actions.map((t, i) => (
            <li
              key={t.title}
              className="sl-fade-up break-inside-avoid rounded-2xl border border-line bg-surface p-6"
              style={{ animationDelay: `${300 + i * 100}ms` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-semibold">
                  {i + 1}. {t.title}
                </h3>
                <div className="flex gap-2">
                  <Badge value={t.priority} />
                  <Badge value={t.effort} prefix="effort: " />
                </div>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted">
                {SIGNAL_LABELS[t.signal] ?? t.signal} · {t.affectedPattern}
              </p>
              <p className="mt-3 text-muted">{t.why}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {t.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <UrlList urls={t.affectedUrls} />
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Spam signals</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {a.signals.map((s) => (
            <div key={s.id} className="break-inside-avoid rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{SIGNAL_LABELS[s.id] ?? s.id}</h3>
                <Badge value={s.level} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.finding}</p>
              <UrlList urls={s.exampleUrls} />
            </div>
          ))}
        </div>
      </section>

      {flagged.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">Pages to review ({flagged.length})</h2>
          <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
            {flagged.map((p) => (
              <li key={p.url} className="break-inside-avoid p-4">
                <div className="flex items-start justify-between gap-3">
                  <a
                    href={p.url}
                    rel="nofollow noopener"
                    target="_blank"
                    className="min-w-0 truncate text-sm text-accent underline"
                  >
                    {p.url.replace(/^https?:\/\//, "")}
                  </a>
                  <Badge value={p.verdict.quality} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {p.wordCount} words · {p.verdict.note}
                </p>
                {losses.has(pageKey(p.url)) && (
                  <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">
                    Lost clicks after the {report.gsc?.losers?.update ?? "last update"}:{" "}
                    {losses.get(pageKey(p.url))!.before} → {losses.get(pageKey(p.url))!.after} per 28 days
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <GscSection
        connectHref={`/api/gsc/connect?deep=${id}`}
        gsc={report.gsc}
        result={gscResult}
        enabled={gscEnabled()}
        pitch="Connect Google Search Console: we'll find the pages that lost clicks after Google's spam and core updates, review them, and update your action plan around them. It takes a few minutes."
        verdictOf={(url) => verdicts.get(pageKey(url))}
      />

      <p className="mt-8 text-xs text-muted">
        This report is an estimate based on public pages. It is not a guarantee, and Spamlyze is not affiliated with
        Google.
      </p>
    </>
  );
}

const ERROR_LABELS: Record<string, string> = {
  challenge: "blocked by an anti-bot firewall",
  timeout: "timed out",
  http_429: "rate-limited (HTTP 429)",
  http_403: "refused (HTTP 403)",
  http_404: "not found (HTTP 404)",
  not_html: "not HTML pages",
  network: "network errors",
  blocked: "not reachable",
};

/** What the report is built on: pages read, pages we couldn't load and why, Search Console pages covered. */
function Coverage({ report, losingReviewed }: { report: DeepReport; losingReviewed: number }) {
  const notLoaded = Object.entries(report.crawlErrors ?? {}).filter(([, n]) => n > 0);
  const missing = notLoaded.reduce((sum, [, n]) => sum + n, 0);
  const losing = report.gscLosses?.length ?? 0;
  const unreadable = report.sitemapStatus === "unreadable";
  if (!missing && !losing && !unreadable) return null;
  return (
    <ul className="mt-4 space-y-1 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
      {losing > 0 && (
        <li>
          Search Console: {losingReviewed} of the {losing} pages that lost the most clicks were reviewed
          {report.gsc?.losers?.update ? ` (after the ${report.gsc.losers.update})` : ""}.
        </li>
      )}
      {missing > 0 && (
        <li>
          {missing} page{missing === 1 ? "" : "s"} couldn&apos;t be loaded:{" "}
          {notLoaded.map(([code, n]) => `${n} ${ERROR_LABELS[code] ?? code}`).join(", ")}.
        </li>
      )}
      {unreadable && (
        <li>
          Your sitemap exists but we couldn&apos;t read it{report.sitemapChallenged ? " (an anti-bot firewall answered instead)" : ""}
          . Pages were picked from your site&apos;s links instead.
        </li>
      )}
    </ul>
  );
}
