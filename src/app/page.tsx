import { DeepCheckoutNow, DeepPriceLarge, DeepPriceText, PromoBanner } from "@/components/deep-price";
import { QuickCheckForm } from "@/components/quick-check-form";
import { deepReportEnabled } from "@/lib/deep/config";
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
    body: "The free Quick Check samples 15 public pages. No sign-up needed.",
  },
  {
    n: "2",
    title: "Get an estimated risk score",
    body: "We extrapolate from that sample: a fast first read, not a diagnosis.",
  },
  {
    n: "3",
    title: "Fix what matters first",
    body: "The Deep Report reviews up to 500 pages with your Search Console data and gives you a page-by-page action plan.",
  },
];

const faqs = [
  {
    q: "Do you guarantee my site won't be hit, or that it will recover?",
    a: "No. Nobody outside Google can. Spamlyze shows you the patterns spam policies target, so you can fix them before or after an update.",
  },
  {
    q: "How accurate is the free Quick Check?",
    a: "It's an estimate. We look at a sample of 15 public pages and extrapolate to the whole site, so it can miss problems on pages we didn't see, and it doesn't use your Search Console data. Use it as a first read. The Deep Report reviews up to 500 pages one by one and folds in your Search Console data, including the pages that actually lost clicks.",
  },
  {
    q: "Do I need to connect Search Console?",
    a: "No, the free check only needs your URL. Connecting Search Console is optional and free: it shows whether your clicks actually dropped after each Google update. In the Deep Report, the pages that lost the most clicks are added to the analysis and reviewed one by one.",
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
    a: "Up to 500 pages reviewed one by one, your Search Console data built into the analysis, a risk score for each spam policy, a prioritized action plan with the exact pages to fix, and a PDF export. It's a one-time payment, priced by size: one price up to 100 pages, another up to 500. We count the pages in your sitemap before checkout, and you get a full refund if we can't analyze your site.",
  },
  {
    q: "Is there an API?",
    a: "It's coming on December 1, 2026, for agencies and tools that want to run Quick Checks and Deep Reports from their own stack, with prepaid credits. It will also come with an MCP server, so AI assistants like Claude or ChatGPT can run checks for you, and it plugs into Zapier or n8n. Join the API list above for early access.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      {deepReportEnabled() && <PromoBanner />}
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
        <p className="mt-2 max-w-3xl text-sm text-muted">
          The free check is an estimate from 15 sampled pages. For a real diagnosis,{" "}
          <a href="#deep-report" className="font-medium text-foreground underline decoration-accent underline-offset-4">
            get the Deep Report: up to 500 pages plus your Search Console data, <DeepPriceText />
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

      <CompareSection />

      <section id="deep-report" className="mx-auto w-full max-w-5xl scroll-mt-8 px-4 pb-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Plans</h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col rounded-2xl border border-line bg-surface p-8">
            <h3 className="text-xl font-semibold">Quick Check</h3>
            <p className="mt-1 text-3xl font-semibold">Free</p>
            <ul className="mt-6 space-y-2 text-muted">
              <li>Your URL is all we need</li>
              <li>A sample of 15 public pages</li>
              <li>Estimated risk score, extrapolated from that sample</li>
              <li>Top 3 issues with example pages</li>
              <li>Search Console traffic chart around each update</li>
              <li>Results in about 30 seconds</li>
            </ul>
          </div>
          <div className="relative flex flex-col rounded-2xl border-2 border-accent bg-surface p-8">
            <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
              Most complete
            </span>
            <h3 className="text-xl font-semibold">Deep Report</h3>
            <DeepPriceLarge />
            <ul className="mt-6 space-y-2 text-muted">
              <li>Up to 100 or 500 pages analyzed one by one, depending on your site&apos;s size</li>
              <li>Search Console built in: the pages that lost clicks are added and reviewed</li>
              <li>Risk score and findings for every spam policy</li>
              <li>Prioritized action plan with the pages to fix</li>
              <li>PDF export</li>
              <li>Full refund if we can&apos;t analyze your site</li>
            </ul>
            <div className="mt-auto pt-8">
              {deepReportEnabled() ? (
                <DeepCheckoutNow />
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

      <ApiTeaser />

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

const COMPARE: { label: string; quick: string; deep: string }[] = [
  { label: "Pages analyzed", quick: "A sample of 15", deep: "Up to 100 or 500 by site size, one by one" },
  {
    label: "Data used",
    quick: "Public pages only",
    deep: "Public pages plus your Search Console clicks and impressions",
  },
  {
    label: "Pages that lost traffic",
    quick: "Not used in the score",
    deep: "Added to the crawl and reviewed first",
  },
  { label: "Risk score", quick: "Extrapolated from the sample", deep: "Built from every page reviewed" },
  { label: "What you get", quick: "Top 3 issues", deep: "Prioritized action plan with the exact pages, PDF export" },
];

function CompareSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
      <h2 className="text-3xl font-semibold tracking-tight">An estimate, or a diagnosis</h2>
      <p className="mt-3 max-w-2xl text-muted">
        The Quick Check extrapolates from very little data, on purpose: it&apos;s free and takes 30 seconds. The Deep
        Report looks at your whole site and at what actually happened to your traffic.
      </p>
      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-[1fr_1fr] border-b border-line text-sm font-semibold sm:grid-cols-[1.1fr_1fr_1fr]">
          <span className="hidden px-5 py-3 text-muted sm:block" />
          <span className="px-5 py-3">Quick Check · free</span>
          <span className="px-5 py-3 text-accent sm:bg-accent/5">Deep Report</span>
        </div>
        <dl className="divide-y divide-line text-sm">
          {COMPARE.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_1fr] sm:grid-cols-[1.1fr_1fr_1fr]">
              <dt className="col-span-2 px-5 pb-1 pt-3 font-semibold sm:col-span-1 sm:py-3">{row.label}</dt>
              <dd className="px-5 pb-3 text-muted sm:py-3">{row.quick}</dd>
              <dd className="px-5 pb-3 font-medium sm:bg-accent/5 sm:py-3 sm:font-normal">{row.deep}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ApiTeaser() {
  return (
    <section id="api" className="mx-auto w-full max-w-5xl scroll-mt-8 px-4 pb-20 sm:px-6">
      <div className="grid grid-cols-1 gap-8 rounded-2xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div className="min-w-0">
          <p className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            Coming December 1
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">The Spamlyze API</h2>
          <p className="mt-3 leading-relaxed text-muted">
            For agencies and SEO tools: run Quick Checks and Deep Reports for your clients from your own stack, and get
            the results as JSON. Prepaid credits, no subscription.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <span className="font-semibold">Works with your AI assistant.</span>{" "}
              <span className="text-muted">
                An MCP server lets Claude, ChatGPT and other assistants run checks for you, no code needed.
              </span>
            </li>
            <li>
              <span className="font-semibold">Automate it.</span>{" "}
              <span className="text-muted">
                Plug it into your scripts, Zapier or n8n, and check every client site each week without lifting a finger.
              </span>
            </li>
          </ul>
          <pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-background p-4 text-xs leading-relaxed">
            <code>{`POST /v1/quick-checks
{ "url": "https://example.com" }

→ { "riskScore": 34, "riskLevel": "moderate", ... }`}</code>
          </pre>
        </div>
        <div>
          <p className="text-sm font-semibold">Get early access</p>
          <p className="mt-1 text-sm text-muted">One email when the API opens, with the docs and pricing.</p>
          <div className="mt-4">
            <WaitlistForm source="api" compact cta="Notify me" />
          </div>
        </div>
      </div>
    </section>
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
                your Search Console data feeds the analysis. The pages that lost clicks are crawled and reviewed with up
                to 500 others, and the action plan starts with them.
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
