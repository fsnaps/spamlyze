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
import { coverage, pagesWord } from "@/lib/check/coverage";
import { cookies } from "next/headers";
import { LockedBadge, LockedLines, ReportEmailForm } from "@/components/report-email-form";
import { unlockCookie, validUnlockToken } from "@/lib/check/unlock";
import { benchmarkFor } from "@/lib/check/benchmark";
import { RiskRank } from "@/components/risk-rank";

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
function scoreRange(score: number, c: Coverage) {
  const share = (c.share ?? 0) / 100;
  const margin = share >= 0.8 ? 5 : share >= 0.4 ? 10 : 15;
  return { low: Math.max(0, score - margin), high: Math.min(100, score + margin) };
}

type Coverage = ReturnType<typeof coverage>;
const fmt = (x: number) => x.toLocaleString("en-US");

/** "all 13 pages of your site" or "your site's single page", for a site checked in full. */
function wholeSite(total: number) {
  return total === 1 ? "your site's single page" : `all ${fmt(total)} pages of your site`;
}

const CHECK = (
  <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DOT = <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-stone-400/60" />;

/**
 * Right under the score: the main action of the page. What this Quick Check saw next to what the
 * Deep Report adds, and the checkout button itself (or a link to it when the buyer must pick a size).
 */
function DeepNextStep({
  sampled,
  c,
  deepPages,
  action,
  reassurance,
}: {
  sampled: number;
  c: Coverage;
  deepPages: number;
  action: React.ReactNode;
  reassurance: React.ReactNode;
}) {
  const total = c.total;
  const deepCovers =
    total === 1
      ? "Your single page reviewed in depth"
      : `${total !== null && total <= deepPages ? `All ${fmt(total)} pages` : `Up to ${deepPages} pages`} reviewed one by one`;
  return (
    <section className="sl-fade-up mt-10 rounded-2xl border border-line bg-surface p-6 shadow-sm [animation-delay:200ms] sm:p-8 print:hidden">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Recommended next step</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        {c.complete ? "Find the pages losing traffic" : "Know exactly which pages to fix"}
      </h2>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted">
        {c.complete
          ? "This Quick Check saw your whole site, but not your traffic. The Deep Report adds your Search Console data and turns it into a prioritized action plan."
          : `This Quick Check is an estimate from ${sampled} ${pagesWord(sampled)}. The Deep Report checks the rest of your site, uses your Search Console data, and tells you what to fix first.`}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-6 border-t border-line pt-6 text-sm sm:grid-cols-2 sm:gap-10">
        <div>
          <p className="font-medium text-muted">This Quick Check</p>
          <ul className="mt-3 space-y-2.5 text-muted">
            <li className="flex gap-3">
              {DOT}
              {c.complete && total !== null
                ? `${wholeSite(total).replace(/^./, (x) => x.toUpperCase())} checked`
                : `${sampled} ${pagesWord(sampled)} sampled, the rest extrapolated`}
            </li>
            <li className="flex gap-3">{DOT}Search Console not used in the score</li>
            <li className="flex gap-3">{DOT}Issues described, pages not listed</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold">Deep Report</p>
          <ul className="mt-3 space-y-2.5">
            <li className="flex gap-3">{CHECK}{deepCovers}</li>
            <li className="flex gap-3">{CHECK}Search Console built into the score</li>
            <li className="flex gap-3">
              {CHECK}
              {c.complete ? "Pages losing clicks since the spam update, ranked" : "The exact pages to fix, in order"}
            </li>
          </ul>
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
        <div className="w-full sm:w-72 sm:shrink-0">{action}</div>
        <div className="text-xs leading-relaxed text-muted sm:pt-3.5">{reassurance}</div>
      </div>
    </section>
  );
}

/**
 * What the Deep Report adds to a signal: the affected pages across the whole site. The blurred
 * figure is a stand-in, never a real count.
 */
function SiteWidePages({ total }: { total: number | null }) {
  // A believable stand-in, never more pages than the site has.
  const shown = total ? Math.min(24, Math.max(1, Math.round(total * 0.3))) : 24;
  return (
    <a
      href="#deep-report"
      className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-3 py-2 text-sm hover:border-accent print:hidden"
    >
      <span className="min-w-0 text-muted">
        Affected pages{" "}
        <span aria-hidden className="select-none whitespace-nowrap font-semibold text-foreground blur-[4px]">
          {shown} of {total ? fmt(total) : "500"}
        </span>
      </span>
      <span className="shrink-0 font-semibold text-accent">
        Deep Report →
      </span>
    </a>
  );
}

/** Next to the score: how much of the site the estimate is based on. */
function CoverageNote({ sampled, c }: { sampled: number; c: Coverage }) {
  if (c.complete && c.total !== null) return <WholeSiteNote total={c.total} />;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
      <div className="flex items-start gap-3">
        <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 fill-amber-500">
          <path d="M8.26 2.9a2 2 0 0 1 3.48 0l6.3 11.2A2 2 0 0 1 16.3 17H3.7a2 2 0 0 1-1.74-2.9ZM10 7a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {c.total
              ? `Based on ${sampled} of ${fmt(c.total)} pages (${c.share}% of your site)`
              : `Based on ${sampled} ${pagesWord(sampled)} only`}
          </p>
          {c.share !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-500/20" aria-hidden>
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${c.share}%` }} />
            </div>
          )}
          <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80">
            {c.total
              ? `The other ${fmt(c.unseen)} ${c.unseen === 1 ? "page wasn't" : "pages weren't"} checked, including any that are losing traffic.`
              : "We found no sitemap, so we can't tell how much of your site that is. Pages losing traffic weren't checked."}{" "}
            <a href="#deep-report" className="font-semibold underline underline-offset-4 print:hidden">
              Check every page
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Small and one-page sites: the Quick Check saw everything, so no coverage warning. */
function WholeSiteNote({ total }: { total: number }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
      <div className="flex items-start gap-3">
        <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 fill-emerald-500">
          <path d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm3.7 5.3a1 1 0 0 0-1.4 0L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4Z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {total === 1 ? "Your site has a single page, and we checked it" : `All ${fmt(total)} pages checked (100% of your site)`}
          </p>
          <p className="mt-2 text-sm text-emerald-900/80 dark:text-emerald-200/80">
            {total === 1
              ? "Nothing was extrapolated: this score is about your whole site."
              : "We found these pages on your site and checked every one: nothing was extrapolated."}{" "}
            It doesn&apos;t use your Search Console traffic yet.
          </p>
        </div>
      </div>
    </div>
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
  const sampled = check.pagesAnalyzed;
  const c = coverage(sampled, check.metrics);
  const whole = c.complete && c.total !== null ? wholeSite(c.total) : null;
  const range = scoreRange(a?.riskScore ?? 0, c);
  const unlocked =
    (await cookies()).has(unlockCookie(id)) || validUnlockToken(id, typeof query.u === "string" ? query.u : undefined);
  const benchmark = a ? await benchmarkFor(a.riskScore) : null;
  const flagged = a ? a.signals.filter((s) => s.level === "moderate" || s.level === "high").length : 0;
  const date = check.createdAt?.toDate?.().toLocaleDateString("en-US", { dateStyle: "medium" }) ?? "";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
      <p className="text-sm text-muted">
        Quick Check ·{" "}
        {whole
          ? `${c.total === 1 ? "1 page" : `all ${fmt(c.total!)} pages`} checked`
          : `${sampled}${c.total ? ` of ${fmt(c.total)}` : ""} ${pagesWord(c.total ?? sampled)} sampled`}{" "}
        · {date}
      </p>
      <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{check.domain}</h1>

      {check.robotsBlocked || !a ? (
        <p className="mt-8 rounded-2xl border border-line bg-surface p-6 text-muted">
          Your robots.txt blocks crawlers from your homepage, so we couldn&apos;t analyze the site. Allow
          SpamlyzeBot (or all crawlers) and run the check again.
        </p>
      ) : (
        <>
          <section className="sl-fade-up mt-8 flex flex-col gap-8 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
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
            <div className="sl-fade-up min-w-0 flex-1 [animation-delay:300ms]">
              {benchmark && (
                <div className="mb-4">
                  <RiskRank benchmark={benchmark} score={a.riskScore} />
                </div>
              )}
              <p className="leading-relaxed">{a.summary}</p>
              <div className="mt-5">
                <CoverageNote sampled={sampled} c={c} />
              </div>
            </div>
          </section>
          <DeepNextStep
            sampled={sampled}
            c={c}
            deepPages={tierMaxPages(tier)}
            action={
              deepReportEnabled() && !largePricing ? (
                <DeepCheckout url={check.url} price={deepPrice} />
              ) : (
                <a
                  href="#deep-report"
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent-strong"
                >
                  {deepReportEnabled() ? `Get the Deep Report · ${deepPrice}` : "Join the Deep Report waitlist"}
                </a>
              )
            }
            reassurance={
              deepReportEnabled() ? (
                <>
                  {pricing.promo && (
                    <span className="mr-2 inline-block rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-accent">
                      {pricing.promo.label} −{pricing.promo.percentOff}%
                    </span>
                  )}
                  One-time payment, no subscription. Read-only access to Search Console. Automatic refund if the
                  report can&apos;t be produced.
                </>
              ) : (
                "We'll email you once, the day it opens."
              )
            }
          />

          <section className="mt-16 sm:mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">Top 3 things to fix</h2>
            <p className="mt-2 text-sm text-muted">
              {whole ? `Based on ${whole}.` : `Based on the ${sampled} sampled ${pagesWord(sampled)} only.`}
            </p>
            <div className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <ol className="divide-y divide-line">
                {a.topIssues.map((t, i) => (
                  <li
                    key={t.title}
                    className="sl-fade-up flex gap-4 py-6 first:pt-0 last:pb-0"
                    style={{ animationDelay: `${500 + i * 120}ms` }}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-sm font-semibold tabular-nums text-muted">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <h3 className="font-semibold leading-snug">{t.title}</h3>
                      {unlocked || i === 0 ? (
                        <>
                          <p className="mt-2 leading-relaxed text-muted">{t.why}</p>
                          <p className="mt-3 leading-relaxed">
                            <span className="font-semibold">Fix: </span>
                            {t.fix}
                          </p>
                          <UrlList urls={t.exampleUrls} />
                        </>
                      ) : (
                        <LockedLines />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <ReportEmailForm checkId={id} unlocked={unlocked} issues={a.topIssues.length} flagged={flagged} />
            </div>
            <p className="mt-5 text-sm leading-relaxed text-muted">
              {whole
                ? `These come from ${whole}, but not from your traffic. The Deep Report adds your Search Console data and turns these fixes into a prioritized plan.`
                : `${
                    c.unseen > 0
                      ? `These come from ${sampled} ${pagesWord(sampled)}. The other ${fmt(c.unseen)} ${c.unseen === 1 ? "page wasn't" : "pages weren't"} checked.`
                      : `These come from a sample of ${sampled} ${pagesWord(sampled)}.`
                  } The Deep Report lists the exact pages to fix, in order.`}{" "}
              <a href="#deep-report" className="whitespace-nowrap font-semibold text-foreground hover:text-accent print:hidden">
                {whole ? "Add your traffic data →" : "Check every page →"}
              </a>
            </p>
          </section>

          <section className="mt-16 sm:mt-20">
            <h2 className="text-2xl font-semibold tracking-tight">Spam signals</h2>
            <p className="mt-2 text-sm text-muted">
              We rated your site on the 5 signals Google&apos;s spam updates target
              {flagged > 0 ? `: ${flagged} need attention` : ""}.
              {!unlocked && (
                <>
                  {" "}
                  The ratings come with the{" "}
                  <a href="#unlock" className="text-foreground underline decoration-line underline-offset-4 hover:decoration-foreground">
                    free detailed Quick Check
                  </a>
                  .
                </>
              )}
            </p>
            <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
              {a.signals.map((s, i) => (
                <li key={s.id} className="sl-fade-up px-6 py-5 sm:px-8 sm:py-6" style={{ animationDelay: `${900 + i * 90}ms` }}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{SIGNAL_LABELS[s.id] ?? s.id}</h3>
                    {unlocked ? <LevelBadge level={s.level} /> : <LockedBadge />}
                  </div>
                  {unlocked ? (
                    <>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{s.finding}</p>
                      <UrlList urls={s.exampleUrls} />
                      <SiteWidePages total={c.total} />
                    </>
                  ) : (
                    <LockedLines lines={1} />
                  )}
                </li>
              ))}
              <li className="px-6 py-5 sm:px-8 sm:py-6">
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
                      <a href="#search-console" className="text-foreground underline decoration-line underline-offset-4 hover:decoration-foreground">
                        Connect it for free
                      </a>
                      .
                    </>
                  ) : (
                    "Needs Search Console. Coming soon."
                  )}
                </p>
              </li>
            </ul>
          </section>

        </>
      )}

      <section id="deep-report" className="mt-16 scroll-mt-8 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:mt-20 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Deep Report</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">From an estimate to a diagnosis</h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          {whole
            ? `This check looked at ${whole}, without your traffic. The Deep Report reviews ${whole} in depth and gives you a prioritized action plan.`
            : `This check estimated your risk from ${sampled} ${pagesWord(sampled)}. The Deep Report reviews ${
                c.total !== null && c.total <= tierMaxPages(tier)
                  ? `all ${fmt(c.total)} pages of your site`
                  : `up to ${tierMaxPages(tier)} pages`
              } one by one and gives you a prioritized action plan with the exact pages to fix.`}
        </p>
        <div className="mt-6 max-w-2xl rounded-xl bg-background p-5">
          <p className="font-semibold">Built on your Search Console data</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The Deep Report connects to Search Console (read-only), finds the pages that lost clicks around each Google
            update, reviews them, and builds that traffic into the score and the action plan. The Quick Check doesn&apos;t.
          </p>
        </div>
        <div className="mt-8 max-w-md">
          {deepReportEnabled() ? (
            <>
              <p className="mb-3 text-sm text-muted">
                {whole && c.total !== null
                  ? `Your site has ${fmt(c.total)} ${pagesWord(c.total)}: this price covers up to ${tierMaxPages(tier)} pages.`
                  : sitemapCount === null
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

      {a && !check.robotsBlocked && (
        <GscSection
          quiet
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
              Optional. See whether your clicks dropped around Google&apos;s updates. Shown for information only: it
              doesn&apos;t change this Quick Check score.
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
      )}

      <p className="mt-10 text-xs text-muted">
        This is an estimate extrapolated from a small sample of public pages. It is not a guarantee, and Spamlyze is not
        affiliated with Google.
      </p>
    </main>
  );
}
