import { QuickCheckForm } from "@/components/quick-check-form";
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
    body: "With Search Console connected, we line up your clicks and impressions with known update dates.",
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
    a: "Not for the free check, which only needs your URL. Connecting Search Console (read-only) lets us confirm the diagnosis with your real traffic data.",
  },
  {
    q: "Is Spamlyze affiliated with Google?",
    a: "No. Spamlyze is an independent tool based on Google's public spam policies.",
  },
  {
    q: "When is the Deep Report available?",
    a: "Soon. The free check works today. Join the early access list and you'll be the first to get the Deep Report.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section className="mx-auto w-full max-w-5xl px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
        <p className="mb-5 inline-flex rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted">
          Free spam risk check · No sign-up
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Will the next spam update hit your site?
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Spamlyze scans your site for the patterns Google&apos;s spam policies target and
          tells you what to fix first. Check before the update, or diagnose after a drop.
        </p>
        <div className="mt-10 max-w-3xl">
          <QuickCheckForm />
        </div>
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

      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Plans</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-8">
            <h3 className="text-xl font-semibold">Quick Check</h3>
            <p className="mt-1 text-3xl font-semibold">Free</p>
            <ul className="mt-6 space-y-2 text-muted">
              <li>Your URL is all we need</li>
              <li>Spam risk score across 6 signals</li>
              <li>Top 3 issues with example pages</li>
              <li>Results in about 30 seconds</li>
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-accent bg-surface p-8">
            <h3 className="text-xl font-semibold">Deep Report</h3>
            <p className="mt-1 text-3xl font-semibold">
              One-time <span className="text-base font-normal text-muted">· price at launch</span>
            </p>
            <ul className="mt-6 space-y-2 text-muted">
              <li>Up to 500 pages analyzed one by one</li>
              <li>Search Console data lined up with update dates</li>
              <li>Prioritized action plan</li>
              <li>PDF export to share with your team or client</li>
            </ul>
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
        <h2 className="text-3xl font-semibold tracking-tight">Get the Deep Report first</h2>
        <p className="mt-3 text-muted">
          One email when it launches, and a heads-up when a new spam update rolls out. No spam, obviously.
        </p>
        <div className="mt-8 text-left">
          <WaitlistForm source="footer" />
        </div>
      </section>
    </main>
  );
}
