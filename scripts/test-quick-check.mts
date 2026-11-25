// Offline tests for the Quick Check crawler: SSRF guards, robots.txt, sitemap, metrics.
// Run: npx tsx --conditions=react-server scripts/test-quick-check.mts
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

// Fake DNS: fixture hosts resolve to public IPs, "evil.test" to the metadata server.
const realLookup = dns.lookup;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async (host: string) => {
  if (["shop.test", "www.shop.test", "small.test", "one.test"].includes(host)) return [{ address: "93.184.215.14", family: 4 }];
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

// Small site: the sitemap lists the homepage and "/about/", the homepage links "/about" and a
// page missing from the sitemap. Every page is counted once and the total never trails the sample.
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html" } });
const smallPages = ["about", "contact", "services", "fees", "faq", "blog", "team", "terms", "privacy", "guide", "news"];
Object.assign(routes, {
  "https://small.test/": () =>
    html(page("Small home", 400, '<a href="/about">a</a><a href="/about/">a</a><a href="/index.html">h</a><a href="/extra">e</a>')),
  "https://small.test/robots.txt": () => new Response("User-agent: *\nAllow: /\n"),
  "https://small.test/sitemap.xml": () =>
    new Response(
      `<urlset><url><loc>https://small.test/</loc></url>${smallPages.map((p) => `<url><loc>https://www.small.test/${p}/</loc></url>`).join("")}</urlset>`,
    ),
  "https://one.test/": () => html(page("One pager", 700, '<a href="#contact">c</a><a href="mailto:x@one.test">m</a>')),
});
for (const p of [...smallPages, "extra"]) routes[`https://small.test/${p}/`] = routes[`https://small.test/${p}`] = () => html(page(p, 350));
routes["https://small.test/index.html"] = () => html(page("Small home", 400));

const { coverage } = await import("../src/lib/check/coverage");
const small = await crawl(new URL("https://small.test/"));
const sm = computeMetrics(small);
assert.equal(small.sitemapUrlCount, 12);
assert.equal(new Set(small.pages.map((p) => p.url)).size, small.pages.length, "a page was counted twice");
assert.equal(sm.pagesAnalyzed, 13, "homepage + 11 sitemap pages + /extra");
assert.equal(sm.knownPageCount, 13);
assert.equal(sm.coversWholeSite, true);
assert.deepEqual(coverage(sm.pagesAnalyzed, sm), { total: 13, share: 100, unseen: 0, complete: true });

// One-page site: no sitemap, no other page, so the whole site was checked.
const one = computeMetrics(await crawl(new URL("https://one.test/")));
assert.equal(one.pagesAnalyzed, 1);
assert.deepEqual(coverage(one.pagesAnalyzed, one), { total: 1, share: 100, unseen: 0, complete: true });

// Large site: the sample is partial and the total comes from the sitemap.
const big = coverage(m.pagesAnalyzed, m);
assert.equal(big.complete, false);
assert.equal(big.total, 41, "41 sitemap URLs (one disallowed by robots) + homepage link + homepage");

// Checks stored before knownPageCount: "13 of 12" becomes a whole-site check, never total < sampled.
assert.deepEqual(coverage(13, { sitemapUrlCount: 11 }), { total: 13, share: 100, unseen: 0, complete: true });
assert.equal(coverage(15, { sitemapUrlCount: 300 }).unseen, 286);
assert.equal(coverage(5, { sitemapUrlCount: 0 }).total, null, "an unreadable sitemap says nothing about size");
assert.equal(coverage(5, { sitemapUrlCount: null }).total, null);

// Scoring: the overall score follows the worst signal, with a small bonus for other elevated ones.
const { overallScore, normalizeSignal, findUrlSeries, levelFor } = await import("../src/lib/check/scoring");
const sig = (score: number, level: "low" | "moderate" | "high" | "unknown" = levelFor(score)) => ({ score, level });
assert.equal(overallScore([sig(10), sig(12), sig(5)]), 12, "a clean site keeps its worst signal");
assert.equal(overallScore([sig(70), sig(10), sig(5)]), 70, "one clear violation is enough to be high");
assert.equal(overallScore([sig(50), sig(45), sig(40)]), 60, "50 + 15% of 45 + 8% of 40");
assert.equal(overallScore([sig(95), sig(90), sig(90)]), 100);
assert.equal(overallScore([sig(0, "unknown"), sig(20)]), 20, "unknown signals don't count");
assert.equal(overallScore([]), 0);
assert.deepEqual(normalizeSignal({ score: 45, level: "low" as const }), { score: 45, level: "moderate" }, "level follows score");
assert.deepEqual(normalizeSignal({ score: 30, level: "unknown" as const }), { score: 0, level: "unknown" });

// URL series: location and nationality variants are found, language prefixes ignored.
const cities = ["jaslo", "mlawa", "krakow", "gdansk", "poznan", "lodz"];
const series = findUrlSeries(
  [
    ...cities.map((c) => `/strony-internetowe-${c}/`),
    ...["french", "german", "us", "uk", "indian"].map((n, i) => `${i % 2 ? "/en" : ""}/uzbekistan-visa-for-${n}-citizens`),
    ...Array.from({ length: 30 }, (_, i) => `/blog/topic${i}-article${i}/`),
  ],
  410,
);
assert.deepEqual(series.map((x) => x.pattern), ["/strony-internetowe-*", "/uzbekistan-visa-*"]);
assert.equal(series[0].estimatedPages, 60, "6/41 of the sample × 410 sitemap URLs");
assert.equal(findUrlSeries(["/about/", "/contact/", "/a-b/"], 3).length, 0);
assert.ok(Array.isArray(m.urlSeries), "metrics carry the URL series");

console.log("all quick-check tests passed", JSON.stringify({ pages: result.pages.length, metrics: m }, null, 0).slice(0, 400));
