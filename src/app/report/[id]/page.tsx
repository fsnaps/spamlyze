import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCheck } from "@/lib/check/run";
import { ScoreGauge } from "@/components/score-gauge";
import { WaitlistForm } from "@/components/waitlist-form";

export const metadata: Metadata = {
  title: "Spam risk report",
  robots: { index: false, follow: false },
};

const SIGNAL_LABELS: Record<string, string> = {
  scaled_content: "Scaled content",
  thin_doorway: "Thin and doorway pages",
  site_reputation_abuse: "Site reputation abuse",
  link_schemes: "Link schemes",
  expired_domain: "Expired domain signals",
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

export default function ReportPage({ params }: PageProps<"/report/[id]">) {
  return (
    <Suspense
      fallback={<main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 text-muted sm:px-6">Loading report…</main>}
    >
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await getCheck(id);
  if (!check) notFound();
  const a = check.analysis;
  const date = check.createdAt?.toDate?.().toLocaleDateString("en-US", { dateStyle: "medium" }) ?? "";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
      <p className="text-sm text-muted">
        Quick Check · {check.pagesAnalyzed} pages sampled{check.metrics.sitemapUrlCount ? ` of ${check.metrics.sitemapUrlCount} in your sitemap` : ""} · {date}
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
              <p className="-mt-3 text-sm text-muted">risk score</p>
              <div className="mt-2">
                <LevelBadge level={a.riskLevel} />
              </div>
            </div>
            <p className="sl-fade-up leading-relaxed [animation-delay:300ms]">{a.summary}</p>
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-tight">Top 3 things to fix</h2>
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
                  Needs Search Console. Coming with the Deep Report.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="mt-12 rounded-2xl border-2 border-accent bg-surface p-6">
        <h2 className="text-xl font-semibold">Want the full picture?</h2>
        <p className="mt-2 text-muted">
          The Deep Report analyzes up to 500 pages one by one and lines up your Search Console data with
          update dates. Leave your email to get it first, and we&apos;ll warn you when the next spam update
          rolls out.
        </p>
        <div className="mt-5">
          <WaitlistForm source="report" site={check.domain} />
        </div>
      </section>

      <p className="mt-8 text-xs text-muted">
        This is an estimate based on a small sample of public pages. It is not a guarantee, and Spamlyze is not
        affiliated with Google.
      </p>
    </main>
  );
}
