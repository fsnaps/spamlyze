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
import { LockedLines, ReportEmailForm, UnlockLink } from "@/components/report-email-form";
import { unlockCookie, validUnlockToken } from "@/lib/check/unlock";

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

/** How much of the site the Quick Check saw, and what the Deep Report adds. */
function CompareReports({
  sampled,
  c,
  deepPages,
  cta,
}: {
  sampled: number;
  c: Coverage;
  deepPages: number;
  cta: string;
}) {
  const total = c.total;
  const deepCovers =
    total === 1
      ? "Your single page reviewed in depth"
      : `${total !== null && total <= deepPages ? `All ${fmt(total)} pages` : `Up to ${deepPages} pages`} reviewed one by one`;
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="font-semibold">Quick Check or Deep Report?</p>
      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl border border-line p-4">
          <p className="font-semibold">This Quick Check</p>
          <ul className="mt-2 space-y-1.5 text-muted">
            <li>
              {c.complete && total !== null
                ? `${wholeSite(total).replace(/^./, (x) => x.toUpperCase())} checked`
                : `${sampled} ${pagesWord(sampled)} sampled, the rest extrapolated`}
            </li>
            <li>Search Console shown below, not used in the score</li>
          </ul>
        </div>
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="font-semibold text-accent">Deep Report</p>
          <ul className="mt-2 space-y-1.5">
            <li>{deepCovers}</li>
            <li>Search Console built into the score and the action plan</li>
            {c.complete && <li>Pages losing clicks since the spam update, ranked</li>}
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
        <span aria-hidden>🔒</span> Deep Report
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
            <div className="sl-fade-up min-w-0 flex-1 [animation-delay:300ms]">
              <p className="leading-relaxed">{a.summary}</p>
              <div className="mt-4">
                <CoverageNote sampled={sampled} c={c} />
              </div>
            </div>
          </section>
          <ReportEmailForm checkId={id} unlocked={unlocked} issues={a.topIssues.length} flagged={flagged} />
          <CompareReports
            sampled={sampled}
            c={c}
            deepPages={tierMaxPages(tier)}
            cta={deepReportEnabled() ? `See the Deep Report · ${deepPrice}` : "Join the Deep Report waitlist"}
          />

          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-tight">Top 3 things to fix</h2>
            <p className="mt-1 text-sm text-muted">
              {whole ? `Based on ${whole}.` : `Based on the ${sampled} sampled ${pagesWord(sampled)} only.`}
            </p>
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
                  {unlocked || i === 0 ? (
                    <>
                      <p className="mt-2 text-muted">{t.why}</p>
                      <p className="mt-2">
                        <span className="font-semibold">Fix: </span>
                        {t.fix}
                      </p>
                      <UrlList urls={t.exampleUrls} />
                    </>
                  ) : (
                    <>
                      <LockedLines />
                      <UnlockLink />
                    </>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-line p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted">
                {whole
                  ? `These come from ${whole}, but not from your traffic. The Deep Report adds your Search Console data: it finds the pages losing clicks and turns these fixes into a prioritized plan.`
                  : `${
                      c.unseen > 0
                        ? `These come from ${sampled} ${pagesWord(sampled)}. The other ${fmt(c.unseen)} ${c.unseen === 1 ? "page wasn't" : "pages weren't"} checked, including any that are losing traffic.`
                        : `These come from a sample of ${sampled} ${pagesWord(sampled)}.`
                    } The Deep Report reviews every page it covers and lists the exact ones to fix, in order.`}
              </p>
              <a href="#deep-report" className="shrink-0 font-semibold text-accent underline underline-offset-4 print:hidden">
                {whole ? "Add your traffic data →" : "Check every page →"}
              </a>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-tight">Spam signals</h2>
            {!unlocked && (
              <p className="mt-1 text-sm text-muted">
                We rated your site on 5 spam signals{flagged > 0 ? `: ${flagged} need attention` : ""}. <a href="#unlock" className="font-semibold text-accent underline underline-offset-4">Unlock the ratings for free</a>
              </p>
            )}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {a.signals.map((s, i) => (
                <div
                  key={s.id}
                  className="sl-fade-up rounded-2xl border border-line bg-surface p-6"
                  style={{ animationDelay: `${900 + i * 90}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">{SIGNAL_LABELS[s.id] ?? s.id}</h3>
                    {unlocked ? (
                      <LevelBadge level={s.level} />
                    ) : (
                      <span className="rounded-full bg-stone-500/10 px-2.5 py-0.5 text-xs font-semibold text-muted">
                        <span aria-hidden>🔒</span> Locked
                      </span>
                    )}
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
          {whole
            ? `This check looked at ${whole}, without your traffic data. The Deep Report reviews ${whole} in depth, builds your Search Console data into the score, finds the pages losing clicks, and gives you a prioritized action plan.`
            : `This check estimated your risk from ${sampled} ${pagesWord(sampled)}. The Deep Report reviews ${
                c.total !== null && c.total <= tierMaxPages(tier)
                  ? `all ${fmt(c.total)} pages of your site`
                  : `up to ${tierMaxPages(tier)} pages`
              } one by one, builds your Search Console data into the score, and gives you a prioritized action plan with the exact pages to fix.`}
        </p>
        <div className="mt-5 max-w-md">
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

      <p className="mt-8 text-xs text-muted">
        This is an estimate extrapolated from a small sample of public pages. It is not a guarantee, and Spamlyze is not
        affiliated with Google.
      </p>
    </main>
  );
}
