// Offline tests for the Quick Check crawler: SSRF guards, robots.txt, sitemap, metrics.
// Run: npx tsx --conditions=react-server scripts/test-quick-check.mts
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

// Fake DNS: fixture hosts resolve to public IPs, "evil.test" to the metadata server.
const realLookup = dns.lookup;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async (host: string) => {
  if (host === "shop.test" || host === "www.shop.test") return [{ address: "93.184.215.14", family: 4 }];
  if (host === "evil.test") return [{ address: "169.254.169.254", family: 4 }];
  if (host === "v6.test") return [{ address: "::ffff:10.0.0.1", family: 6 }];
  return realLookup(host, { all: true });
};
syncBuiltinESMExports();

const page = (title: string, words: number, extra = "") =>
  `<html lang="en"><head><title>${title}</title><meta name="description" content="d"></head><body><nav>menu</nav><main><h1>${title}</h1><p>${Array.from({ length: words }, (_, i) => `word${i % 50}`).join(" ")}</p>${extra}</main></body></html>`;

const sitemapUrls = [
  ...Array.from({ length: 30 }, (_, i) => `https://shop.test/blog/post-${i}`),
  ...Array.from({ length: 10 }, (_, i) => `https://shop.test/best-casino-bonus-${i}`),
  "https://shop.test/private/secret",
];

const routes: Record<string, () => Response> = {
  "https://shop.test/": () => new Response(page("Shop home", 500, '<a href="/blog/post-1">x</a><a href="https://partner.com/a" rel="sponsored">p</a>'), { headers: { "content-type": "text/html" } }),
  "https://shop.test/robots.txt": () => new Response("User-agent: *\nDisallow: /private/\nSitemap: https://shop.test/sitemap.xml\n"),
  "https://shop.test/sitemap.xml": () =>
    new Response(`<?xml version="1.0"?><urlset>${sitemapUrls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`, { headers: { "content-type": "application/xml" } }),
  "https://evil.test/": () => new Response("should never be fetched"),
  "https://shop.test/redirect-evil": () => new Response(null, { status: 302, headers: { location: "https://evil.test/" } }),
};
let fetchedUrls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = input.toString();
  fetchedUrls.push(url);
  if (routes[url]) return routes[url]();
  if (url.includes("/blog/post-")) return new Response(page("Blog post", 120), { headers: { "content-type": "text/html" } });
  if (url.includes("casino")) return new Response(page("Best casino bonus codes", 900, '<a href="https://casino-aff.com/x">c</a>'), { headers: { "content-type": "text/html" } });
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const { normalizeInputUrl, safeFetch, FetchBlockedError } = await import("../src/lib/check/safe-fetch");
const { crawl } = await import("../src/lib/check/crawl");
const { computeMetrics } = await import("../src/lib/check/metrics");

// URL normalization
assert.equal(normalizeInputUrl("shop.test").toString(), "https://shop.test/");
for (const bad of ["localhost", "http://127.0.0.1:8080", "ftp://shop.test", "https://user:pw@shop.test", "intranet", "x.local"]) {
  assert.throws(() => normalizeInputUrl(bad), FetchBlockedError, bad);
}

// SSRF: private targets and redirects into them are blocked
for (const target of ["https://evil.test/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest", "https://v6.test/", "https://shop.test/redirect-evil"]) {
  fetchedUrls = [];
  await assert.rejects(safeFetch(target), FetchBlockedError, target);
  assert.ok(!fetchedUrls.includes("https://evil.test/"), `fetched private host via ${target}`);
}

// Crawl: honours robots.txt, uses the sitemap, samples across sections
fetchedUrls = [];
const result = await crawl(new URL("https://shop.test/"));
assert.equal(result.robotsBlocked, false);
assert.equal(result.sitemapUrlCount, 41);
assert.ok(!fetchedUrls.some((u) => u.includes("/private/")), "fetched a robots-disallowed URL");
assert.equal(result.pages.length, 14);
assert.ok(result.pages.some((p) => p.url.includes("casino")), "sample should reach the casino section");

const m = computeMetrics(result);
assert.ok(m.thinPageShare > 0.5, `thin share ${m.thinPageShare}`);
assert.ok(m.riskyTermHits.some((h) => h.term === "casino"));
assert.ok(m.nearDuplicateShare > 0.5, `near-dup ${m.nearDuplicateShare}`);
assert.equal(m.topPathPrefixes[0].prefix, "/blog/");
assert.ok(m.sponsoredOrNofollowShare > 0);

// Structured output schema converts
const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
const { z } = await import("zod");
assert.ok(zodOutputFormat(z.object({ a: z.number().int(), b: z.enum(["x", "y"]) })));

console.log("all quick-check tests passed", JSON.stringify({ pages: result.pages.length, metrics: m }, null, 0).slice(0, 400));
