import { site } from "@/lib/site";

// /llms.txt (llmstxt.org): a plain summary of Spamlyze for AI assistants and answer engines.
const BODY = `# ${site.name}

> ${site.name} checks websites against Google's spam policies (scaled content abuse, thin and doorway pages, site reputation abuse, expired domain abuse, link schemes) and tells site owners what to fix first, using the site's real Google Search Console traffic.

## Products

- [Quick Check](${site.url}/): free on the website. A risk estimate in under a minute from about 15 sampled pages. On a large site it is an estimate, not a verdict.
- [Deep Report](${site.url}/#deep-report): every page (up to 500) judged against Google's spam policies, crossed with Search Console clicks before and after each Google update, with a prioritised action plan.

## API and MCP server

- [API documentation](${site.url}/docs/api): REST API at ${site.url}/v1, Bearer API key. POST /v1/checks (Quick Check, $0.15), POST /v1/reports (Deep Report, $12, Search Console included), GET /v1/reports/{id} to follow a report. Prepaid balance, no subscription, daily spending cap, failed requests not charged.
- [OpenAPI specification](${site.url}/openapi.json)
- [MCP server](${site.url}/docs/mcp): hosted remote MCP server at ${site.url}/mcp (Streamable HTTP, Bearer API key) for Claude, Cursor and other AI agents. Tools: quick_check, start_deep_report, get_deep_report, get_balance.
- [API keys and credits](${site.url}/account)

## Policies

- [Terms, including API and MCP terms](${site.url}/terms)
- [Privacy](${site.url}/privacy)
- Contact: ${site.contactEmail}
`;

export function GET() {
  return new Response(BODY, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
