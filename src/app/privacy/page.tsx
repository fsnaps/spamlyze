import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Spamlyze collects, uses and protects your data, including Google Search Console data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {site.policyUpdated}</p>

      <div className="prose-legal">
        <p>
          This policy explains what data {site.name} ({site.url}), operated by {site.legalEntity},
          collects, why, and what control you have over it. Questions:{" "}
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
        </p>

        <h2>Data we collect</h2>
        <ul>
          <li>
            <strong>Waitlist:</strong> your email address and, if you give it, your website&apos;s
            domain.
          </li>
          <li>
            <strong>Account:</strong> when you sign in with Google, your name, email address and
            profile picture.
          </li>
          <li>
            <strong>Sites you analyze:</strong> the URL you submit and the public pages we crawl
            from it.
          </li>
          <li>
            <strong>Google Search Console data</strong> (only if you connect it): the list of
            properties you can access and, for the property you choose, search performance data
            (clicks, impressions, CTR, position by page, query and date) and URL indexing status.
          </li>
          <li>
            <strong>Payments:</strong> handled by Stripe. We never see or store your card details.
          </li>
          <li>
            <strong>Technical data:</strong> server logs (IP address, browser type, pages
            requested) kept for security and debugging.
          </li>
        </ul>

        <h2>How we use Google user data</h2>
        <p>
          {site.name} requests read-only access to Google Search Console
          (<code>https://www.googleapis.com/auth/webmasters.readonly</code>). We use this data
          only to produce the spam risk analysis and reports you request: we compare your search
          performance with the dates of known algorithm updates and flag the pages and queries
          affected.
        </p>
        <p>
          {site.name}&apos;s use and transfer of information received from Google APIs to any
          other app will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul>
          <li>We only use Google user data to provide and improve the features you use.</li>
          <li>We do not sell Google user data.</li>
          <li>We do not use Google user data for advertising.</li>
          <li>
            We do not use Google user data to train generalized AI or machine learning models.
          </li>
          <li>
            No human reads your Google user data, except with your explicit consent (for example
            when you ask for support), for security purposes, or when required by law.
          </li>
        </ul>

        <h2>AI processing</h2>
        <p>
          To write your report, we send excerpts of your crawled pages and aggregated Search
          Console figures to Anthropic&apos;s Claude API. Under Anthropic&apos;s commercial terms,
          this data is not used to train their models. We do not send your name, email address or
          OAuth tokens.
        </p>

        <h2>Service providers</h2>
        <ul>
          <li>Google Cloud and Firebase (hosting, database, authentication, storage)</li>
          <li>Anthropic (AI analysis of page content)</li>
          <li>Stripe (payments)</li>
          <li>Our email provider (waitlist and account emails)</li>
        </ul>
        <p>We share data with these providers only as needed to run {site.name}.</p>

        <h2>Storage and retention</h2>
        <p>
          Data is stored on Google Cloud. OAuth tokens are encrypted. We keep reports while your
          account exists. Raw Search Console data is deleted 30 days after the report it was
          used for; only the aggregated figures shown in your report are kept. Waitlist emails
          are deleted on request or 12 months after launch if you never create an account.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask us to access, correct, export or delete your data at any time by emailing{" "}
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>. You can revoke{" "}
          {site.name}&apos;s access to your Google account at any time from{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            your Google Account permissions
          </a>
          ; we then delete the stored tokens. If you are in the EU or UK, you may also complain to
          your data protection authority.
        </p>

        <h2>Cookies</h2>
        <p>
          We use only the cookies needed to keep you signed in. We do not use advertising cookies.
        </p>

        <h2>Changes</h2>
        <p>
          If we change this policy in a meaningful way, we will update the date above and notify
          account holders by email.
        </p>
      </div>
    </main>
  );
}
