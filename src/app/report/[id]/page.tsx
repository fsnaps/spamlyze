import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCheck } from "@/lib/check/run";
import { ScoreGauge } from "@/components/score-gauge";
import { WaitlistForm } from "@/components/waitlist-form";
import { DeepCheckout } from "@/components/deep-checkout";
import { deepPricingNow, deepReportEnabled } from "@/lib/deep/config";
import { formatUsd, LARGE_TIER_MAX_PAGES, tierFor, tierMaxPages } from "@/lib/pricing";
import { GscSection } from "@/components/gsc-section";
import { gscEnabled } from "@/lib/gsc/oauth";
import { getQuickImport } from "@/lib/gsc/imports";
import { SIGNAL_LABELS } from "@/lib/check/labels";
import { ReportEmailForm } from "@/components/report-email-form";

export const metadata: Metadata = {
  title: "Spam risk report",
  robots: { index: false, follow: false },
};

const LEVEL_STYLES: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  moderate: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  high: "bg-red-500/10 text-red-700 dark:text-red-300",
  unknown: "bg-stone-500/10 text-muted",
};

function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${LEVEL_STYLES[level] ?? LEVEL_STYLES.unknown}`}>
      {level}
    </span>
  );
}

function UrlList({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
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

/**
 * A rough range around the estimated score, wider when the sample covers less of the site.
 * It's a reading aid, not a statistical interval: the score itself is an AI estimate.
 */
function scoreRange(score: number, sampled: number, sitemapCount: number | null) {
  const total = sitemapCount === null ? null : sitemapCount + 1;
  const share = total ? sampled / total : 0;
  const margin = share >= 0.8 ? 5 : share >= 0.4 ? 10 : 15;
  return { low: Math.max(0, score - margin), high: Math.min(100, score + margin) };
}

/** How much of the site the Quick Check saw, and what the Deep Report adds. */
function Coverage({
  sampled,
  sitemapCount,
  deepPages,
  cta,
}: {
  sampled: number;
  sitemapCount: number | null;
  deepPages: number;
  cta: string;
}) {
  // Sitemap URLs plus the homepage.
  const total = sitemapCount === null ? null : sitemapCount + 1;
  const share = total ? Math.min(100, Math.max(1, Math.round((sampled / total) * 100))) : null;
  const deepCovers = total !== null && total <= deepPages ? `All ${total.toLocaleString("en-US")} pages` : `Up to ${deepPages} pages`;
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold">
          This score is an estimate from {sampled} pages{total && total > sampled ? ` out of ${total.toLocaleString("en-US")}` : ""}
        </p>
        {share !== null && <p className="text-sm text-muted">{share}% of your site seen</p>}
      </div>
      {share !== null ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">We found no sitemap, so we can&apos;t tell how much of your site that is.</p>
      )}
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <p className="font-semibold">This Quick Check</p>
          <ul className="mt-2 space-y-1.5 text-muted">
            <li>{sampled} pages sampled, the rest extrapolated</li>
            <li>Search Console shown below, not used in the score</li>
          </ul>
        </div>
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="font-semibold text-accent">Deep Report</p>
          <ul className="mt-2 space-y-1.5">
            <li>{deepCovers} reviewed one by one</li>
            <li>Search Console built into the score and the action plan</li>
          </ul>
        </div>
      </div>
      <a
        href="#deep-report"
        className="mt-5 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong print:hidden"
      >
        {cta}
      </a>
    </section>
  );
}

export default function ReportPage({ params, searchParams }: PageProps<"/report/[id]">) {
  return (
    <Suspense
      fallback={<main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 text-muted sm:px-6">Loading report…</main>}
    >
      <Report params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Report({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const check = await getCheck(id);
  if (!check) notFound();
  const gsc = await getQuickImport(typeof query.g === "string" ? query.g : undefined, id);
  const gscResult = typeof query.gsc === "string" ? query.gsc : undefined;
  // The Quick Check already counted the sitemap: price the Deep Report for this site's size.
  const sitemapCount = check.metrics.sitemapUrlCount;
  const tier = tierFor(sitemapCount);
  const pricing = await deepPricingNow(tier);
  const deepPrice = formatUsd(pricing.cents);
  const largePricing = sitemapCount === null && tier === "small" ? await deepPricingNow("large") : null;
  const deepCta = !deepReportEnabled()
    ? "Join the Deep Report waitlist"
    : pricing.promo
      ? `Get the Deep Report (${deepPrice}, ${pricing.promo.label} -${pricing.promo.percentOff}%)`
      : `Get the Deep Report (${deepPrice})`;
  const a = check.analysis;
  // Pages of the site the Quick Check never saw (sitemap URLs plus the homepage).
  const unseen = sitemapCount === null ? 0 : Math.max(0, sitemapCount + 1 - check.pagesAnalyzed);
  const range = scoreRange(a?.riskScore ?? 0, check.pagesAnalyzed, sitemapCount);
  const date = check.createdAt?.toDate?.().toLocaleDateString("en-US", { dateStyle: "medium" }) ?? "";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
      <p className="text-sm text-muted">
        Quick Check · {check.pagesAnalyzed}
        {sitemapCount ? ` of ${(sitemapCount + 1).toLocaleString("en-US")}` : ""} pages sampled · {date}
      </p>
      <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{check.domain}</h1>

      {check.robotsBlocked || !a ? (
        <p className="mt-8 rounded-2xl border border-line bg-surface p-6 text-muted">
          Your robots.txt blocks crawlers from your homepage, so we couldn&apos;t analyze the site. Allow
          SpamlyzeBot (or all crawlers) and run the check again.
        </p>
      ) : (
        <>
          <section className="sl-fade-up mt-8 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center">
            <div className="shrink-0 text-center sm:w-40">
              <ScoreGauge score={a.riskScore} level={a.riskLevel} />
              <p className="-mt-3 text-sm text-muted">estimated risk</p>
              <p className="mt-1 text-xs tabular-nums text-muted">
                rough range {range.low}–{range.high}
              </p>
              <div className="mt-2">
                <LevelBadge level={a.riskLevel} />
              </div>
            </div>
            <p className="sl-fade-up leading-relaxed [animation-delay:300ms]">{a.summary}</p>
          </section>
          <Coverage
            sampled={check.pagesAnalyzed}
            sitemapCount={sitemapCount}
            deepPages={tierMaxPages(tier)}
            cta={deepReportEnabled() ? `See the Deep Report · ${deepPrice}` : "Join the Deep Report waitlist"}
          />

          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-tight">Top 3 things to fix</h2>
            <p className="mt-1 text-sm text-muted">Based on the {check.pagesAnalyzed} sampled pages only.</p>
            <ol className="mt-6 space-y-4">
              {a.topIssues.map((t, i) => (
                <li
                  key={t.title}
                  className="sl-fade-up rounded-2xl border border-line bg-surface p-6"
                  style={{ animationDelay: `${500 + i * 120}ms` }}
                >
                  <h3 className="font-semibold">
                    {i + 1}. {t.title}
                  </h3>
                  <p className="mt-2 text-muted">{t.why}</p>
                  <p className="mt-2">
                    <span className="font-semibold">Fix: </span>
                    {t.fix}
                  </p>
                  <UrlList urls={t.exampleUrls} />
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-line p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted">
                {unseen > 0
                  ? `These come from ${check.pagesAnalyzed} pages. The other ${unseen.toLocaleString("en-US")} ${unseen === 1 ? "page wasn't" : "pages weren't"} checked.`
                  : `These come from a sample of ${check.pagesAnalyzed} pages.`}{" "}
                The Deep Report reviews every page it covers and lists the exact ones to fix, in order.
              </p>
              <a href="#deep-report" className="shrink-0 font-semibold text-accent underline underline-offset-4 print:hidden">
                Check every page →
              </a>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-tight">Spam signals</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {a.signals.map((s, i) => (
                <div
                  key={s.id}
                  className="sl-fade-up rounded-2xl border border-line bg-surface p-6"
                  style={{ animationDelay: `${900 + i * 90}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{SIGNAL_LABELS[s.id] ?? s.id}</h3>
                    <LevelBadge level={s.level} />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.finding}</p>
                  <UrlList urls={s.exampleUrls} />
                </div>
              ))}
              <div className="rounded-2xl border border-dashed border-line p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Traffic drops around updates</h3>
                  <LevelBadge level="unknown" />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {gsc ? (
                    "See your Search Console results below."
                  ) : gscEnabled() ? (
                    <>
                      Needs Search Console.{" "}
                      <a href="#search-console" className="text-accent underline">
                        Connect it for free
                      </a>
                      .
                    </>
                  ) : (
                    "Needs Search Console. Coming soon."
                  )}
                </p>
              </div>
            </div>
          </section>

          <ReportEmailForm checkId={id} domain={check.domain} />

          <GscSection
            connectHref={`/api/gsc/connect?check=${id}`}
            gsc={gsc}
            result={gscResult}
            enabled={gscEnabled()}
            note={
              gsc ? (
                <>
                  <span className="font-semibold text-foreground">Your Search Console data isn&apos;t used in this score.</span>{" "}
                  It&apos;s shown here for information. The Deep Report crawls the pages that lost clicks and builds them into
                  the score and the action plan.
                </>
              ) : (
              <>
                <span className="font-semibold text-foreground">Shown for information only:</span> these figures
                aren&apos;t part of your Quick Check score. The Deep Report builds them into the score and the action plan.
              </>
              )
            }
            upsell={
              <>
                <p className="mt-2 text-muted">
                  The Deep Report lists them one by one with their clicks before and after, reviews up to 500 pages
                  and gives you a prioritized action plan.
                </p>
                <a
                  href="#deep-report"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 font-semibold text-white"
                >
                  {deepCta}
                </a>
              </>
            }
          />
        </>
      )}

      <section id="deep-report" className="mt-12 scroll-mt-8 rounded-2xl border-2 border-accent bg-surface p-6">
        <h2 className="text-xl font-semibold">From an estimate to a diagnosis</h2>
        <p className="mt-2 text-muted">
          This check estimated your risk from {check.pagesAnalyzed} pages. The Deep Report reviews{" "}
          {sitemapCount !== null && sitemapCount + 1 <= tierMaxPages(tier)
            ? `all ${(sitemapCount + 1).toLocaleString("en-US")} pages of your site`
            : `up to ${tierMaxPages(tier)} pages`}{" "}
          one by one, builds your Search Console data into the score, and gives you a prioritized action plan with the
          exact pages to fix.
        </p>
        <div className="mt-5 max-w-md">
          {deepReportEnabled() ? (
            <>
              <p className="mb-3 text-sm text-muted">
                {sitemapCount === null
                  ? `We found no sitemap, so this price covers up to ${tierMaxPages(tier)} pages.`
                  : `Your sitemap lists ${sitemapCount.toLocaleString("en-US")} pages: this price covers up to ${tierMaxPages(tier)} pages.`}
              </p>
              <DeepCheckout
                url={check.url}
                price={deepPrice}
                largeOption={largePricing ? { pages: LARGE_TIER_MAX_PAGES, price: formatUsd(largePricing.cents) } : undefined}
              />
            </>
          ) : (
            <WaitlistForm source="report" site={check.domain} cta="Notify me at launch" />
          )}
        </div>
      </section>

      <p className="mt-8 text-xs text-muted">
        This is an estimate extrapolated from a small sample of public pages. It is not a guarantee, and Spamlyze is not
        affiliated with Google.
      </p>
    </main>
  );
}
