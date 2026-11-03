import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
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
