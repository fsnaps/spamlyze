# Listing the Spamlyze MCP server in MCP directories

Copy to paste into directory forms. Server: `https://spamlyze.com/mcp` (Streamable HTTP, remote only, closed source).

| Field | Value |
|---|---|
| Name | Spamlyze |
| Registry name | `com.spamlyze/mcp` |
| Server URL | https://spamlyze.com/mcp |
| Transport | Streamable HTTP (remote) |
| Auth | API key, header `Authorization: Bearer spz_live_...` (keys at https://spamlyze.com/account) |
| Website / docs | https://spamlyze.com/docs/mcp |
| API docs | https://spamlyze.com/docs/api, https://spamlyze.com/openapi.json |
| Logo | https://spamlyze.com/apple-icon.png (180×180 PNG), https://spamlyze.com/icon.svg |
| Category | SEO / Marketing (else: Developer tools, Search) |
| Tags | seo, google, spam, search-console, website-audit, content-quality |
| Pricing | Pay as you go, prepaid credits: Quick Check $0.15, Deep Report $12, balance and status calls free. No subscription. |
| Contact | hello@spamlyze.com |

## Short description (≤ 100 characters)

Check a website against Google's spam policies: quick risk estimate or full Deep Report.

## Long description

Spamlyze checks websites against Google's spam policies (scaled content abuse, thin and doorway pages, site reputation abuse, expired domain abuse, link schemes) and tells site owners what to fix first.

Tools:
- `quick_check` ($0.15): a spam risk estimate from a sample of about 15 pages, in 30 to 45 seconds.
- `start_deep_report` ($12): every page of the site (up to 500) judged against Google's spam policies, crossed with the site's Google Search Console clicks before and after each Google update, with a prioritised action plan. The owner connects Search Console through a link, at no extra cost.
- `get_deep_report` (free): progress, then the full results.
- `get_balance` (free): prepaid balance, daily cap and prices.

Prepaid credits, no subscription, daily spending cap, failed requests not charged.

## Client config example

```json
{
  "mcpServers": {
    "spamlyze": {
      "type": "http",
      "url": "https://spamlyze.com/mcp",
      "headers": { "Authorization": "Bearer spz_live_..." }
    }
  }
}
```

## Machine-readable files

- `server.json` (repo root): the official MCP Registry entry, published by the "Publish to the MCP Registry" GitHub Action.
- https://spamlyze.com/.well-known/mcp-registry-auth: domain proof for the registry (public key).
- https://spamlyze.com/.well-known/mcp/server-card.json: server card (tools, auth) for scanners.
- Without an API key, `initialize` and `tools/list` on /mcp answer, so directories can read the tools. Running a tool always needs a key.
