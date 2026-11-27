import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MCP_TOOLS } from "@/lib/api/mcp";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "MCP server: Google spam update checks for Claude and AI agents",
  description:
    "Spamlyze's hosted MCP server lets Claude, Cursor and other AI agents check any website against Google's spam policies: a quick risk estimate, or a full Deep Report built on the site's Search Console traffic.",
  alternates: { canonical: "/docs/mcp" },
};

const MCP_URL = `${site.url}/mcp`;

const FAQ: [string, string][] = [
  [
    "What does the Spamlyze MCP server do?",
    "It gives an AI assistant four tools to check a website against Google's spam policies (scaled content abuse, thin and doorway pages, site reputation abuse, expired domain abuse, link schemes): a Quick Check that estimates the risk from a sample of pages, a Deep Report that judges every page and uses the site's Search Console traffic, a tool to follow a report, and one to read the balance.",
  ],
  [
    "Which AI assistants can use it?",
    "Any client that supports remote MCP servers over Streamable HTTP: Claude Code, Claude Desktop, Cursor, and others. Clients that only speak stdio can use a bridge such as mcp-remote.",
  ],
  [
    "How much does it cost?",
    "The same as the Spamlyze API: $0.15 per Quick Check and $12 per Deep Report, from a prepaid balance with no subscription. Reading results and the balance is free, and a request that fails is not charged.",
  ],
  [
    "Can an agent spend money without asking?",
    "Only from your prepaid balance, within your account's daily cap. The Deep Report tool tells the agent to ask you first, and you can use a dedicated key per agent and revoke it at any time.",
  ],
  [
    "Does it need access to my Google account?",
    "No. For a Deep Report, the site owner opens a link to connect Search Console with read-only access. We import the traffic once, then revoke the access and keep no token.",
  ],
];

const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>;
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-7 text-muted">{children}</p>;

function Code({ children, label }: { children: string; label: string }) {
  return (
    <figure className="mt-3">
      <figcaption className="text-xs font-medium text-muted">{label}</figcaption>
      <pre className="mt-1 overflow-x-auto rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{children}</code>
      </pre>
    </figure>
  );
}

export default function McpDocsPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Spamlyze MCP server",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any (remote MCP over Streamable HTTP)",
      url: `${site.url}/docs/mcp`,
      description: metadata.description,
      offers: [
        { "@type": "Offer", name: "Quick Check", price: "0.15", priceCurrency: "USD" },
        { "@type": "Offer", name: "Deep Report", price: "12.00", priceCurrency: "USD" },
      ],
      publisher: { "@type": "Organization", name: site.name, url: site.url },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <p className="text-sm font-medium text-accent">Developers · MCP</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-tight">Spamlyze MCP server</h1>
      <p className="mt-3 text-lg leading-8">
        Let Claude, Cursor or any AI agent check a website for Google spam update risk, and get a fix-first action plan built on the
        site&apos;s real Search Console traffic.
      </p>
      <P>
        Ask your assistant &quot;Is client-site.com at risk from the next Google spam update?&quot; and it runs a Spamlyze check, reads
        the result and explains what to fix. No code: add one server URL and your API key.
      </P>

      <h2 className="mt-10 text-2xl font-semibold tracking-tight">Set it up in 30 seconds</h2>
      <P>
        1. Get an API key at <Link href="/account" className="text-accent underline">spamlyze.com/account</Link> (sign in with
        Google, add credits). 2. Add the server:
      </P>
      <Code label="Claude Code">{`claude mcp add --transport http spamlyze ${MCP_URL} \\
  --header "Authorization: Bearer $SPAMLYZE_KEY"`}</Code>
      <Code label="Cursor, Claude Desktop and other clients">{`{
  "mcpServers": {
    "spamlyze": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer spz_live_…" }
    }
  }
}`}</Code>
      <P>
        Server URL <C>{MCP_URL}</C>, transport Streamable HTTP, authentication <C>Authorization: Bearer</C> with your Spamlyze API
        key. Stdio-only clients: <C>npx mcp-remote {MCP_URL} --header &quot;Authorization: Bearer spz_live_…&quot;</C>.
      </P>

      <h2 className="mt-10 text-2xl font-semibold tracking-tight">Tools</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {MCP_TOOLS.map((t) => (
              <tr key={t.name}>
                <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs font-semibold">{t.name}</td>
                <td className="px-4 py-3 text-muted">{t.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-muted">
        <li>
          <strong className="text-foreground">quick_check ($0.15)</strong>: a risk estimate in under a minute from about 15 pages.
          Good for screening many domains. The agent is told that the score only covers the pages checked.
        </li>
        <li>
          <strong className="text-foreground">start_deep_report ($12)</strong>: every page (up to 500) judged against Google&apos;s
          spam policies, plus the site&apos;s Search Console traffic: which pages lost clicks, after which update, and a prioritised
          action plan. The agent gives you a link for the site owner to connect Search Console, and asks you before spending.
        </li>
        <li>
          <strong className="text-foreground">get_deep_report</strong> and <strong className="text-foreground">get_balance</strong>: free.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold tracking-tight">Why use it</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-muted">
        <li>Agencies: ask your assistant to check every client site after a Google spam update, and draft the client email.</li>
        <li>SEO work in your editor: check a site while you fix it, and see which pages Google is most likely to act on.</li>
        <li>Real traffic, not guesses: Deep Reports cross the page review with Search Console clicks around each update.</li>
        <li>Pay per use, prepaid, with a daily cap: no subscription, no surprise bill.</li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold tracking-tight">Questions</h2>
      <dl className="mt-4 space-y-5">
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <dt className="font-semibold">{q}</dt>
            <dd className="mt-1 leading-7 text-muted">{a}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-sm text-muted">
        Prefer code? The same features are in the <Link href="/docs/api" className="text-accent underline">REST API</Link>. Terms:{" "}
        <Link href="/terms#api" className="text-accent underline">API and MCP terms</Link>.
      </p>
    </main>
  );
}
