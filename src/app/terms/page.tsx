import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of use of Spamlyze reports, the API and the MCP server.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {site.policyUpdated}</p>

      <div className="prose-legal">
        <h2>The service</h2>
        <p>
          {site.name}, operated by {site.legalEntity}, analyzes websites for patterns that
          search engine spam policies target and suggests fixes. It is an independent tool and is
          not affiliated with or endorsed by Google.
        </p>

        <h2>No guarantee of results</h2>
        <p>
          Our scores and reports are estimates based on public information. We do not guarantee
          that following them will prevent a ranking drop, lift a manual action or restore
          traffic. You remain responsible for the changes you make to your site.
        </p>

        <h2>Your use</h2>
        <ul>
          <li>Only analyze sites you own, manage, or have permission to audit.</li>
          <li>Only connect Search Console properties you are authorized to access.</li>
          <li>Do not use {site.name} to overload, attack or scrape third-party sites.</li>
        </ul>

        <h2>Payments and refunds</h2>
        <p>
          Paid reports are charged in US dollars through Stripe. If a paid report fails to
          generate, we refund it in full.
        </p>

        <h2 id="api">API and MCP server</h2>
        <p>
          These terms also apply to the {site.name} API and MCP server (see the{" "}
          <a href="/docs/api">documentation</a>). In addition:
        </p>
        <ul>
          <li>
            Your API keys are personal to your account. Keep them secret and revoke a key you think is
            exposed. You are responsible for every request made with your keys until you revoke them.
          </li>
          <li>
            Requests are paid from a prepaid balance in US dollars, at the prices shown in the
            documentation and on your account page when you make the request. Reading results is free.
            A request that fails on our side, or that we cannot analyze, is not charged or is refunded
            to your balance automatically.
          </li>
          <li>
            Credits are not cash and cannot be transferred. They do not expire while your account is
            open. Credits are non-refundable, including when you close your account, with two
            exceptions: if we discontinue the API or close your account (other than for abuse or a
            breach of these terms), we refund the unused paid balance; and if you buy as a consumer,
            you keep your legal right to withdraw within 14 days of a purchase for the credits of that
            purchase you have not used. Bonus credits are never refunded.
          </li>
          <li>
            If you turn on automatic top-up, you authorize us to charge your saved card for the chosen
            pack when your balance falls below your threshold, at most twice a day. You can turn it off
            at any time on your account page.
          </li>
          <li>
            We apply rate limits, a daily spend cap per account and a cooldown per domain. We may pause
            new paid requests during exceptional load, and we may suspend keys or accounts used for abuse
            (for example analyzing sites at a volume or pace meant to harm them, or reselling access to
            the API as such).
          </li>
          <li>
            You may build the results into your own products and reports for your clients. Do not
            present them as coming from Google, and keep the coverage information of Quick Checks (a
            Quick Check only looks at a sample of pages).
          </li>
          <li>
            We may change prices or the API with 30 days&apos; notice by email. New prices apply only to
            requests made after the change: your balance keeps its value in US dollars.
          </li>
        </ul>

        <h2>Liability</h2>
        <p>
          To the extent permitted by law, our total liability is limited to the amount you paid
          us in the 12 months before the claim.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </p>
      </div>
    </main>
  );
}
