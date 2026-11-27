import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { apiEnabled } from "@/lib/api/config";
import { openApiSpec } from "@/lib/api/openapi";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "API and MCP documentation",
  description:
    "Check websites against Google's spam policies from your code or your AI agent. REST API and hosted MCP server, paid per request from a prepaid balance.",
  alternates: { canonical: "/docs/api" },
};

const BASE = `${site.url}/v1`;

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="mt-3">
      {label && <figcaption className="text-xs font-medium text-muted">{label}</figcaption>}
      <pre className="mt-1 overflow-x-auto rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{children}</code>
      </pre>
    </figure>
  );
}

function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-20 text-2xl font-semibold tracking-tight">
      <a href={`#${id}`}>{children}</a>
    </h2>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-7 text-muted">{children}</p>;
const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>;

/** Shown until API_ENABLED is "true" (read at request time, not at build). */
async function OpeningBanner() {
  await connection();
  if (apiEnabled()) return null;
  return (
    <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      The API opens on December 1, 2026. You can read the docs and create your account now.
    </p>
  );
}

const ERRORS: [string, string, string][] = [
  ["400", "invalid_body, invalid_url, invalid_max_pages, invalid_search_console, invalid_hit_by_spam_update, invalid_webhook_url, invalid_idempotency_key", "Fix the request. Nothing was charged."],
  ["401", "missing_api_key, invalid_api_key", "Send a valid key."],
  ["402", "insufficient_credits", "Top up your balance."],
  ["403", "account_suspended", "Contact us."],
  ["404", "not_found", "Unknown id, or an id from another account."],
  ["409", "idempotency_in_progress", "The first request with this key is still running."],
  ["422", "robots_blocked, bot_challenge, site_unreachable, analysis_failed, idempotency_key_reused", "We could not analyze this site. Nothing was charged."],
  ["429", "rate_limited, daily_cap_reached, too_many_concurrent, too_many_running, too_many_waiting, domain_cooldown", "Wait for Retry-After."],
  ["503", "api_not_open, budget_exhausted, busy, unavailable", "Retry later (Retry-After when known)."],
];

export default function ApiDocsPage() {
  const endpoints = Object.entries(openApiSpec.paths).flatMap(([path, ops]) =>
    Object.entries(ops).map(([method, op]) => ({ method: method.toUpperCase(), path, summary: (op as { summary: string }).summary })),
  );
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <p className="text-sm font-medium text-accent">Developers</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-tight">Spamlyze API and MCP</h1>
      <P>
        Check websites against Google&apos;s spam policies from your code, your automations (Zapier, n8n, Make) or your AI agent. Every
        request is paid from a prepaid balance in US dollars: a Quick Check costs $0.15 and a Deep Report $12. Reading results is free,
        and a request that fails is never charged.
      </P>
      <P>
        The Deep Report is the one to act on: it reads every page <strong className="text-foreground">and the site&apos;s Google Search Console
        data</strong>, so it tells you whether Google actually cut the site&apos;s traffic, after which update, and which pages lost
        clicks. <a href="#search-console" className="text-accent underline">How Search Console works with the API</a>.
      </P>
      <Suspense>
        <OpeningBanner />
      </Suspense>

      <nav className="mt-8 rounded-xl border border-line bg-surface p-4 text-sm">
        <ol className="grid gap-1 sm:grid-cols-2">
          {[
            ["start", "Quick start"],
            ["choose", "Quick Check or Deep Report?"],
            ["endpoints", "Endpoints"],
            ["reports", "Deep Reports and webhooks"],
            ["search-console", "Search Console in Deep Reports"],
            ["mcp", "MCP server for AI agents"],
            ["errors", "Errors, limits and retries"],
            ["billing", "Credits and billing"],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-accent">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <H2 id="start">Quick start</H2>
      <P>
        1. Sign in at <Link href="/account" className="text-accent underline">spamlyze.com/account</Link> with Google, add credits and
        create an API key. It starts with <C>spz_live_</C> and is shown once: keep it secret, on your server.
      </P>
      <P>2. Send it as a Bearer token. Check your balance:</P>
      <Code label="curl">{`curl ${BASE}/account \\
  -H "Authorization: Bearer $SPAMLYZE_KEY"`}</Code>
      <P>3. Run a Quick Check. It answers in 30 to 45 seconds:</P>
      <Code label="curl">{`curl ${BASE}/checks \\
  -H "Authorization: Bearer $SPAMLYZE_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"url": "example.com"}'`}</Code>
      <Code label="JavaScript (Node 18+)">{`const res = await fetch("${BASE}/checks", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.SPAMLYZE_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ url: "example.com" }),
});
const check = await res.json();
if (!res.ok) throw new Error(check.error.message);
console.log(check.riskScore, check.coverage.message);`}</Code>
      <Code label="Python">{`import os, uuid, requests

r = requests.post(
    "${BASE}/checks",
    headers={
        "Authorization": f"Bearer {os.environ['SPAMLYZE_KEY']}",
        "Idempotency-Key": str(uuid.uuid4()),
    },
    json={"url": "example.com"},
    timeout=120,
)
check = r.json()
r.raise_for_status()
print(check["riskScore"], check["coverage"]["message"])`}</Code>

      <H2 id="choose">Quick Check or Deep Report?</H2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-2" />
              <th className="px-4 py-2">Quick Check</th>
              <th className="px-4 py-2">Deep Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[
              ["Price", "$0.15", "$12"],
              ["Pages", "About 15 (a sample)", "Every page, up to 500"],
              ["Time", "30 to 45 s, synchronous", "5 to 30 min, asynchronous"],
              ["Search Console", "No", "Yes: real clicks, the updates that hit, the pages that lost traffic"],
              ["Result", "Estimated risk score, signals, top 3 fixes", "Verdict per page, risk score, action plan tied to real losses"],
              ["Best for", "Screening many domains", "Diagnosing a site and fixing it"],
            ].map(([k, a, b]) => (
              <tr key={k}>
                <td className="px-4 py-2 font-medium">{k}</td>
                <td className="px-4 py-2 text-muted">{a}</td>
                <td className="px-4 py-2 text-muted">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        A Quick Check only sees a sample. Always read <C>coverage.scoreScope</C>: when it is <C>sample</C>, the score describes the pages
        checked, not the whole site, and <C>headline</C> gives a sentence to show instead of the bare number. Show{" "}
        <C>coverage.message</C> to your users next to the score.
      </P>

      <H2 id="endpoints">Endpoints</H2>
      <P>
        Base URL <C>{BASE}</C>. JSON in, JSON out. Machine-readable description:{" "}
        <a href="/openapi.json" className="text-accent underline">
          openapi.json
        </a>{" "}
        (OpenAPI 3.1, works with Postman, Insomnia and code generators).
      </P>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {endpoints.map((e) => (
              <tr key={`${e.method} ${e.path}`}>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs font-semibold">{e.method}</td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">/v1{e.path}</td>
                <td className="px-4 py-2 text-muted">{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        Both POST endpoints take an optional <C>hitBySpamUpdate</C> (<C>&quot;yes&quot;</C>, <C>&quot;no&quot;</C> or{" "}
        <C>&quot;unsure&quot;</C>): whether the site lost traffic after a spam update. It helps us calibrate the scores.
      </P>
      <Code label="A Quick Check (shortened)">{`{
  "id": "Xk2…",
  "object": "quick_check",
  "domain": "example.com",
  "riskScore": 38,
  "riskLevel": "moderate",
  "headline": "No major issue on the 15 pages checked",
  "coverage": {
    "pagesChecked": 15, "knownPages": 412, "pagesNotChecked": 397,
    "complete": false, "scoreScope": "sample",
    "message": "… The risk score only describes the 15 pages checked …"
  },
  "signals": [{ "id": "scaled_content", "level": "moderate", "score": 41, "finding": "…" }],
  "topIssues": [{ "title": "…", "why": "…", "fix": "…" }],
  "reportUrl": "${site.url}/report/Xk2…",
  "cached": false,
  "charged": { "cents": 15, "currency": "usd" },
  "balance": { "cents": 4985, "currency": "usd" }
}`}</Code>

      <H2 id="reports">Deep Reports and webhooks</H2>
      <P>
        <C>POST /v1/reports</C> answers <C>202</C> at once with the report id. The report then runs on our servers, even if your
        connection closes. Either poll <C>GET /v1/reports/&#123;id&#125;</C> (every 30 s is plenty) until <C>status</C> is{" "}
        <C>done</C> or <C>failed</C>, or set a webhook. A failed report is credited back to your balance automatically. The same domain can be reported
        once per hour.
      </P>
      <Code label="curl">{`curl ${BASE}/reports \\
  -H "Authorization: Bearer $SPAMLYZE_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-1234" \\
  -d '{"url": "example.com", "maxPages": 500}'

curl "${BASE}/reports/REPORT_ID?pages=true" \\
  -H "Authorization: Bearer $SPAMLYZE_KEY"`}</Code>
      <P>
        Set a webhook with <C>PUT /v1/webhook</C> <C>&#123;&quot;url&quot;: &quot;https://…&quot;&#125;</C>. You receive{" "}
        <C>report.done</C>, <C>report.failed</C> and <C>report.updated</C> (Search Console added to a finished report) events, retried up to 6 times over about 9 hours until you answer 2xx. Check
        the <C>Spamlyze-Signature</C> header before trusting a payload, and deduplicate with the event <C>id</C>:
      </P>
      <Code label="Verify a webhook (Node)">{`import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody: the request body as a string, before JSON.parse.
function verify(rawBody, header, secret /* whsec_… */) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`}</Code>
      <Code label="Verify a webhook (Python)">{`import hmac, hashlib, time

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    signed = f"{parts['t']}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])`}</Code>

      <H2 id="search-console">Search Console in Deep Reports</H2>
      <P>
        Public pages show how exposed a site is. Only its own traffic shows whether Google acted on it. With the owner&apos;s Search
        Console, the Deep Report adds 16 months of clicks, the impact of each spam and core update, and the pages that lost clicks:
        they are crawled and reviewed first, and the action plan starts with them. It is included in the $12.
      </P>
      <P>
        Every Deep Report comes with <C>searchConsole.connectUrl</C>. Send that link to the site owner: they sign in with the Google
        account that manages the site and allow read-only access. We import the data once, then revoke the access and keep no token.
        You never handle their Google credentials.
      </P>
      <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-muted">
        <li>
          <strong className="text-foreground">Wait for Search Console (recommended)</strong>: send{" "}
          <C>&quot;searchConsole&quot;: &quot;wait&quot;</C>. The report has the status <C>waiting_for_search_console</C> and starts as
          soon as the owner connects, built on their traffic from the start. Nothing is crawled or analyzed while it waits. After 72
          hours without a connection it runs without Search Console, or, with{" "}
          <C>&quot;onSearchConsoleTimeout&quot;: &quot;cancel&quot;</C>, it is cancelled and the $12 go back to your balance.
        </li>
        <li>
          <strong className="text-foreground">Start now</strong> (default): the report runs at once from public pages. If the owner
          connects later, the report is updated for free with their traffic and you receive <C>report.updated</C>.
        </li>
      </ul>
      <Code label="curl">{`curl ${BASE}/reports \\
  -H "Authorization: Bearer $SPAMLYZE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "client-site.com", "searchConsole": "wait", "onSearchConsoleTimeout": "cancel"}'

# 202 → {
#   "id": "…", "status": "waiting_for_search_console",
#   "searchConsole": {
#     "connected": false,
#     "connectUrl": "${site.url}/api/gsc/connect?deep=…",
#     "waitUntil": "…", "onTimeout": "cancel"
#   }, …
# }`}</Code>
      <P>
        Once connected, <C>searchConsole</C> also gives the property, the update after which the site lost the most clicks (
        <C>worstUpdate</C>) and how many pages lost clicks (<C>pagesThatLostClicks</C>).
      </P>

      <H2 id="mcp">MCP server for AI agents</H2>
      <P>
        Spamlyze runs a hosted MCP server at <C>{site.url}/mcp</C> (Streamable HTTP). Add it to Claude, Cursor or any MCP client with
        your API key: the agent gets four tools, <C>quick_check</C>, <C>start_deep_report</C>, <C>get_deep_report</C> and{" "}
        <C>get_balance</C>. They are billed exactly like the API, and <C>start_deep_report</C> takes the same Search Console options. Agents are told to ask you before starting a paid Deep Report.
      </P>
      <Code label="Claude Code">{`claude mcp add --transport http spamlyze ${site.url}/mcp \\
  --header "Authorization: Bearer $SPAMLYZE_KEY"`}</Code>
      <Code label="Cursor, Claude Desktop and other clients (JSON config)">{`{
  "mcpServers": {
    "spamlyze": {
      "type": "http",
      "url": "${site.url}/mcp",
      "headers": { "Authorization": "Bearer spz_live_…" }
    }
  }
}`}</Code>
      <P>
        Clients that only speak stdio can use a bridge such as{" "}
        <C>npx mcp-remote {site.url}/mcp --header &quot;Authorization: Bearer spz_live_…&quot;</C>. Use a dedicated key for each agent. The
        daily spend cap of your account ($100 by default) also limits what a runaway agent can spend.
      </P>

      <H2 id="errors">Errors, limits and retries</H2>
      <P>
        Every error has the same shape: <C>&#123;&quot;error&quot;: &#123;&quot;code&quot;: &quot;…&quot;, &quot;message&quot;: &quot;…&quot;&#125;&#125;</C>.
        Branch on <C>code</C>, show <C>message</C>.
      </P>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {ERRORS.map(([status, codes, what]) => (
              <tr key={status}>
                <td className="px-4 py-2 font-mono text-xs font-semibold">{status}</td>
                <td className="px-4 py-2 font-mono text-xs">{codes}</td>
                <td className="px-4 py-2 text-muted">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-muted">
        <li>60 requests per minute per key. 3 Quick Checks and 3 Deep Reports running at the same time per account.</li>
        <li>A daily spend cap per account, $100 by default. Write to us to change it.</li>
        <li>
          Send an <C>Idempotency-Key</C> header on POST requests. If a request times out, retry with the same key and the same body:
          you get the first answer back, never a second charge. Keys are kept 24 hours.
        </li>
        <li>On 429 and 503, wait for the number of seconds in <C>Retry-After</C> before retrying.</li>
      </ul>

      <H2 id="billing">Credits and billing</H2>
      <P>
        Add credits by card on your <Link href="/account" className="text-accent underline">account page</Link>: $50, $200 (+$20 free)
        or $500 (+$100 free). You can turn on automatic top-up when the balance runs low, and see every movement with{" "}
        <C>GET /v1/ledger</C>. We email you when your balance gets low. See the{" "}
        <Link href="/terms#api" className="text-accent underline">API terms</Link>.
      </P>
      <P>
        Questions or a bigger volume: <a href={`mailto:${site.contactEmail}`} className="text-accent underline">{site.contactEmail}</a>.
      </P>
    </main>
  );
}
