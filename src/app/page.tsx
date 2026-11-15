import { DeepCheckout } from "@/components/deep-checkout";
import { QuickCheckForm } from "@/components/quick-check-form";
import { deepReportEnabled, deepReportPrice } from "@/lib/deep/config";
import { WaitlistForm } from "@/components/waitlist-form";

const signals = [
  {
    title: "Scaled content",
    body: "Large batches of near-identical or AI-generated pages that add little beyond what already ranks.",
  },
  {
    title: "Thin and doorway pages",
    body: "Pages built to catch a keyword variant, with little original value for the visitor.",
  },
  {
    title: "Site reputation abuse",
    body: "Third-party sections that piggyback on your domain's authority, like coupon or casino directories.",
  },
  {
    title: "Link schemes",
    body: "Outbound link patterns that look paid or exchanged, and anchor text that looks engineered.",
  },
  {
    title: "Expired domain signals",
    body: "Content that has nothing to do with the domain's history, a classic expired-domain pattern.",
  },
  {
    title: "Traffic drops around updates",
    body: "Connect Search Console and we line up 16 months of your clicks with every spam and core update.",
  },
];

const steps = [
  {
    n: "1",
    title: "Enter your URL",
    body: "We crawl a sample of your pages. No sign-up needed for the free check.",
  },
  {
    n: "2",
    title: "Get your risk score",
    body: "Each spam signal is scored, with the pages that trigger it.",
  },
  {
    n: "3",
    title: "Fix what matters first",
    body: "The Deep Report gives you a prioritized, page-by-page action plan.",
  },
];

const faqs = [
  {
    q: "Do you guarantee my site won't be hit, or that it will recover?",
    a: "No. Nobody outside Google can. Spamlyze shows you the patterns spam policies target, so you can fix them before or after an update.",
  },
  {
    q: "Do I need to connect Search Console?",
    a: "No, the free check only needs your URL. Connecting Search Console is optional and free: it shows whether your clicks actually dropped after each Google update. The Deep Report also lists the pages that lost the most clicks.",
  },
  {
    q: "What do you do with my Search Console data?",
    a: "Access is read-only and used once: we import your daily clicks and impressions for this site, then revoke the access right away. We never keep a token, and we never share or sell your data.",
  },
  {
    q: "Is Spamlyze affiliated with Google?",
    a: "No. Spamlyze is an independent tool based on Google's public spam policies.",
  },
  {
    q: "What's in the Deep Report?",
    a: "Up to 500 pages reviewed one by one, a risk score for each spam policy, a prioritized action plan with the exact pages to fix, and a PDF export. It's a one-time payment, refunded in full if we can't analyze your site.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section id="top" className="mx-auto w-full max-w-5xl scroll-mt-8 px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
        <p className="mb-5 inline-flex rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted">
          New: Search Console traffic analysis, free
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Will the next spam update hit your site?
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Spamlyze scans your site for the patterns Google&apos;s spam policies target and
          tells you what to fix first. Connect Search Console to see if an update actually cut your traffic.
        </p>
        <div className="mt-10 max-w-3xl">
          <QuickCheckForm />
        </div>
        <p className="mt-2 text-sm text-muted">
          Need the full picture?{" "}
          <a href="#deep-report" className="font-medium text-foreground underline decoration-accent underline-offset-4">
            Get the Deep Report: 500 pages and an action plan for {deepReportPrice()}
          </a>
        </p>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
          {steps.map((s) => (
            <div key={s.n}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/10 font-semibold text-accent">
                {s.n}
              </span>
              <h2 className="mt-4 text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <GscShowcase />

      <section className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">What we check</h2>
        <p className="mt-3 max-w-2xl text-muted">
          Each signal maps to a spam policy that recent updates have enforced.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((s) => (
            <div key={s.title} className="rounded-2xl border border-line bg-surface p-6">
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="deep-report" className="mx-auto w-full max-w-5xl scroll-mt-8 px-4 pb-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Plans</h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col rounded-2xl border border-line bg-surface p-8">
            <h3 className="text-xl font-semibold">Quick Check</h3>
            <p className="mt-1 text-3xl font-semibold">Free</p>
            <ul className="mt-6 space-y-2 text-muted">
              <li>Your URL is all we need</li>
              <li>Spam risk score across 6 signals</li>
              <li>Top 3 issues with example pages</li>
              <li>Search Console traffic check around each update</li>
              <li>Results in about 30 seconds</li>
            </ul>
          </div>
          <div className="relative flex flex-col rounded-2xl border-2 border-accent bg-surface p-8">
            <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
              Most complete
            </span>
            <h3 className="text-xl font-semibold">Deep Report</h3>
            <p className="mt-1 text-3xl font-semibold">
              {deepReportPrice()} <span className="text-base font-normal text-muted">· one-time</span>
            </p>
            <ul className="mt-6 space-y-2 text-muted">
              <li>Up to 500 pages analyzed one by one</li>
              <li>Risk score and findings for every spam policy</li>
              <li>Prioritized action plan with the pages to fix</li>
              <li>Search Console: the exact pages that lost clicks after each update</li>
              <li>PDF export</li>
              <li>Full refund if we can&apos;t analyze your site</li>
            </ul>
            <div className="mt-auto pt-8">
              {deepReportEnabled() ? (
                <DeepCheckout price={deepReportPrice()} />
              ) : (
                <WaitlistForm source="deep_report" compact cta="Notify me at launch" />
              )}
            </div>
          </div>
          <div className="flex flex-col rounded-2xl border border-dashed border-line bg-surface p-8">
            <h3 className="text-xl font-semibold">Monitoring</h3>
            <p className="mt-1 text-3xl font-semibold">
              Soon <span className="text-base font-normal text-muted">· monthly</span>
            </p>
            <ul className="mt-6 space-y-2 text-muted">
              <li>Your site re-checked on a schedule</li>
              <li>New and changed pages analyzed</li>
              <li>History to see what improved or slipped</li>
              <li>Alert when a spam update rolls out</li>
            </ul>
            <div className="mt-auto pt-8">
              <WaitlistForm source="monitoring" compact cta="I'm interested" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-8 space-y-8">
            {faqs.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 leading-relaxed text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="early-access" className="mx-auto w-full max-w-3xl scroll-mt-8 px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Know when the next spam update hits</h2>
        <p className="mt-3 text-muted">
          One email when Google rolls out a spam update, with what changed and what to check. No spam, obviously.
        </p>
        <div className="mt-8 text-left">
          <WaitlistForm source="footer" cta="Keep me posted" />
        </div>
      </section>
    </main>
  );
}

/** Example data only: illustrates what the Search Console analysis shows. */
const EXAMPLE = [100, 104, 98, 102, 106, 101, 99, 103, 100, 97, 64, 58, 61, 57, 60, 59, 62, 58, 61, 60];

function GscShowcase() {
  const W = 480;
  const H = 180;
  const x = (i: number) => 10 + (i / (EXAMPLE.length - 1)) * (W - 20);
  const y = (v: number) => 10 + (1 - v / 120) * (H - 30);
  const path = EXAMPLE.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-20 sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Search Console analysis</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Did the update actually hit you?</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Connect Google Search Console in one click. We line up 16 months of your clicks with every spam and core
            update Google has confirmed, and tell you which ones cut your traffic.
          </p>
          <ul className="mt-6 space-y-3">
            <li>
              <span className="font-semibold">Free with the Quick Check:</span>{" "}
              <span className="text-muted">your traffic chart and a verdict for each update.</span>
            </li>
            <li>
              <span className="font-semibold">In the Deep Report:</span>{" "}
              <span className="text-muted">
                the exact pages that lost clicks, plus up to 500 pages reviewed and a prioritized action plan.
              </span>
            </li>
            <li>
              <span className="font-semibold">Private by design:</span>{" "}
              <span className="text-muted">read-only access, used once, then revoked. We never keep a token.</span>
            </li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#top"
              className="inline-flex h-12 items-center rounded-xl border border-line px-5 font-semibold hover:border-accent"
            >
              Run the free check
            </a>
            <a
              href="#deep-report"
              className="inline-flex h-12 items-center rounded-xl bg-accent px-5 font-semibold text-white hover:bg-accent-strong"
            >
              Get the Deep Report
            </a>
          </div>
        </div>
        <figure className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Daily clicks</span>
            <span className="text-muted">Example</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label="Example: clicks drop by 40% after a spam update">
            <rect x={x(9.5)} y={10} width={x(11) - x(9.5)} height={H - 30} className="fill-red-500/20" />
            <line x1={10} x2={W - 10} y1={H - 20} y2={H - 20} className="stroke-line" />
            <path d={path} fill="none" className="stroke-foreground" strokeWidth={2} strokeLinejoin="round" />
            <text x={x(10.25)} y={H - 6} textAnchor="middle" className="fill-current text-[11px] opacity-60">
              Spam update
            </text>
          </svg>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-line p-3 text-sm">
            <span>August spam update</span>
            <span className="flex items-center gap-3">
              <span className="whitespace-nowrap tabular-nums text-muted">-40% clicks</span>
              <span className="whitespace-nowrap rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                Likely hit
              </span>
            </span>
          </div>
        </figure>
      </div>
    </section>
  );
}
