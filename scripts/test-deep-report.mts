// End-to-end test of the Deep Report job against the Firestore emulator, with a fake
// website and a fake Claude API. Run:
//   npx firebase-tools emulators:start --only firestore --project demo-spamlyze   (port 8080 by default)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:deep
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the Deep Report test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";
// Start from an empty database: daily stats checked below would otherwise add up across runs.
await fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/databases/(default)/documents`,
  { method: "DELETE" },
);
process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.BREVO_API_KEY = "test-brevo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async () => [{ address: "93.184.215.14", family: 4 }];
syncBuiltinESMExports();

const html = (title: string, words: number, extra = "") =>
  `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${Array.from({ length: words }, (_, i) => `w${i % 40}`).join(" ")}</p>${extra}</main></body></html>`;
const sitemap = [
  ...Array.from({ length: 50 }, (_, i) => `https://shop.test/guides/guide-${i}`),
  ...Array.from({ length: 20 }, (_, i) => `https://shop.test/coupons/code-${i}`),
];

const claudeCalls: string[] = [];
let lastPlanInput = "";
function claudeReply(body: { system: string; messages: { content: string }[] }) {
  const input = body.messages[0].content;
  let out: unknown;
  if (body.system.includes("one by one")) {
    claudeCalls.push("judge");
    const urls = [...input.matchAll(/"url": "([^"]+)"/g)].map((m) => m[1]).slice(1); // skip the homepage
    out = {
      pages: urls.map((url) =>
        url.includes("coupons")
          ? { url, quality: "spammy", signals: ["site_reputation_abuse"], note: "Coupon page unrelated to the site." }
          : { url, quality: "good", signals: [], note: "Useful guide." },
      ),
    };
  } else if (body.system.includes("action plan")) {
    claudeCalls.push("plan");
    lastPlanInput = input;
    out = {
      actions: [
        {
          title: "Remove the coupon section",
          priority: "now",
          effort: "low",
          signal: "site_reputation_abuse",
          why: "20 coupon pages are unrelated to the site.",
          steps: ["Noindex /coupons/", "Remove the links from the menu"],
          affectedPattern: "/coupons/*",
          affectedUrls: ["https://shop.test/coupons/code-1", "https://invented.example/x"],
        },
      ],
    };
  } else {
    claudeCalls.push("overview");
    out = {
      riskScore: 140,
      riskLevel: "high",
      summary: "Coupon section.",
      signals: [{ id: "site_reputation_abuse", level: "high", score: 80, finding: "20 coupon pages.", exampleUrls: [] }],
    };
  }
  return Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(out) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
}

const emails: { to: string; subject: string; html: string }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url === "https://api.brevo.com/v3/smtp/email") {
    const b = JSON.parse(String(init?.body));
    emails.push({ to: b.to[0].email, subject: b.subject, html: b.htmlContent });
    return Response.json({ messageId: "x" }, { status: 201 });
  }
  if (url.startsWith("https://api.anthropic.com/")) {
    const body = input instanceof Request ? await input.text() : String(init?.body);
    return claudeReply(JSON.parse(body));
  }
  const htmlHeaders = { headers: { "content-type": "text/html" } };
  if (url === "https://shop.test/") return new Response(html("Garden guides", 600), htmlHeaders);
  if (url === "https://shop.test/robots.txt") return new Response("User-agent: *\nSitemap: https://shop.test/sitemap.xml\n");
  if (url === "https://shop.test/sitemap.xml")
    return new Response(`<urlset>${sitemap.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`);
  if (url.includes("/guides/")) return new Response(html("Guide", 900), htmlHeaders);
  if (url.includes("/old/")) return new Response(html("Old page", 60), htmlHeaders);
  if (url.includes("/coupons/")) return new Response(html("Coupon code", 80, '<a href="https://aff.example/x" rel="sponsored">deal</a>'), htmlHeaders);
  if (url === "https://down.test/") return new Response("oops", { status: 500 });
  // A site behind a firewall that lets the homepage and a few static pages through and challenges the rest.
  if (url.startsWith("https://fw.test/")) {
    const path = new URL(url).pathname;
    const challenge = () =>
      new Response("<html><title>Vercel Security Checkpoint</title></html>", {
        status: 429,
        headers: { "content-type": "text/html", "x-vercel-mitigated": "challenge" },
      });
    if (path === "/")
      return new Response(
        html("School finder", 800, Array.from({ length: 40 }, (_, i) => `<a href="/schools/s-${i}">s</a>`).join("") + '<a href="/about">a</a><a href="https://www.fw.test/contact">c</a>'),
        htmlHeaders,
      );
    if (path === "/robots.txt") return new Response("User-agent: *\nAllow: /\nSitemap: https://fw.test/sitemap.xml\n");
    if (path === "/sitemap.xml") return new Response("<sitemapindex><sitemap><loc>https://fw.test/sitemap/schools.xml</loc></sitemap></sitemapindex>");
    if (path === "/about" || path === "/contact") return new Response(html("About", 300), htmlHeaders);
    return challenge();
  }
  // www/apex mix: the site answers on the apex, its sitemap lists www URLs.
  if (url === "https://apex.test/") return new Response(html("Apex", 500), htmlHeaders);
  if (url === "https://apex.test/robots.txt") return new Response("User-agent: *\nSitemap: https://apex.test/sitemap.xml\n");
  if (url === "https://apex.test/sitemap.xml")
    return new Response(`<urlset>${Array.from({ length: 12 }, (_, i) => `<url><loc>https://www.apex.test/p-${i}</loc></url>`).join("")}</urlset>`);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const { attachSearchConsole, createDeepReport, getDeepPages, getDeepReport, runStep } = await import("../src/lib/deep/job");
const { db } = await import("../src/lib/firebase-admin");

async function startPaid(url: string, plan: Parameters<typeof createDeepReport>[1] = {}) {
  const id = await createDeepReport(new URL(url), plan);
  assert.equal((await getDeepReport(id))!.status, "awaiting_payment");
  // Steps do nothing until the payment is confirmed.
  assert.equal((await runStep(id))!.phase, "discover");
  await db().collection("deepReports").doc(id).update({ status: "running", email: "buyer@example.com" }); // what confirmPayment does
  return id;
}

// Full run
const id = await startPaid("https://shop.test/");

// Two concurrent steps: the lease lets only one of them work.
await Promise.all([runStep(id), runStep(id)]);
let r = (await getDeepReport(id))!;
assert.equal(r.phase, "crawl", "discover ran once");
assert.equal(r.urls!.length, 71);

for (let i = 0; i < 30 && r.status === "running"; i++) r = (await runStep(id))!;
assert.equal(r.status, "done", `ended in ${r.status}: ${r.error}`);
assert.equal(r.pagesCrawled, 71);
assert.equal(r.pagesAnalyzed, 71);
assert.equal(claudeCalls.filter((c) => c === "judge").length, 5, "71 pages in batches of 15");
assert.equal(r.analysis!.riskScore, 100, "score is clamped");
assert.equal(r.analysis!.signals.length, 5, "one entry per signal");
assert.deepEqual(r.analysis!.actions[0].affectedUrls, ["https://shop.test/coupons/code-1"], "invented URLs dropped");
assert.ok(r.usage!.input > 0);

const buyerEmails = () => emails.filter((e) => e.to === "buyer@example.com");
assert.equal(buyerEmails().length, 1, "one 'ready' email");
assert.match(emails[0].subject, /ready/);
assert.ok(emails[0].html.includes(`/deep/${id}`), "email links to the report");
if (process.env.EMAIL_PREVIEW) (await import("node:fs")).writeFileSync(process.env.EMAIL_PREVIEW, emails[0].html);

const pages = await getDeepPages(id);
assert.equal(pages.length, 71);
assert.equal(pages.filter((p) => p.verdict?.quality === "spammy").length, 20);
assert.ok(r.metrics!.sponsoredOrNofollowShare > 0);

// A site that's down fails cleanly, with a user-facing reason.
const down = await startPaid("https://down.test/");
const d = (await runStep(down))!;
assert.equal(d.status, "failed");
assert.match(d.error!, /HTTP 500/);
assert.equal(buyerEmails().length, 1, "no 'ready' email for a failed report");
assert.ok(
  emails.some((e) => e.to === "hello@spamlyze.com" && e.subject.includes("failed: down.test")),
  "the team is told about failed reports",
);

// Daily stats
const { lastDays, apiCostUsd } = await import("../src/lib/stats");
const [day] = await lastDays(1);
assert.equal(day.deepDone, 1);
assert.equal(day.deepFailed, 1);
assert.equal(day.opusInputTokens, 7000, "token usage counted per call");
assert.ok(apiCostUsd(day) > 0);

// Search Console connected after the report was delivered: the losing pages are added,
// reviewed, and the plan is rewritten with them, without a second email.
const gscData = {
  property: "sc-domain:shop.test",
  importedAt: new Date().toISOString(),
  daily: [],
  updates: [],
  losers: { update: "March 2024 spam update", pages: [] },
  lostPages: 8,
};
const losses = [
  { url: "https://www.shop.test/coupons/code-3/", before: 120, after: 15 }, // already crawled (www + slash)
  ...Array.from({ length: 6 }, (_, i) => ({ url: `https://shop.test/old/page-${i}`, before: 50 - i, after: 5 })),
  { url: "https://other.test/x", before: 40, after: 0 }, // another site: ignored
];
await attachSearchConsole(id, gscData, losses);
r = (await getDeepReport(id))!;
assert.equal(r.status, "running", "a delivered report is reopened");
for (let i = 0; i < 30 && r.status === "running"; i++) r = (await runStep(id))!;
assert.equal(r.status, "done", `update ended in ${r.status}: ${r.error}`);
assert.equal(r.urls!.length, 77, "6 missing losing pages added");
assert.equal(r.pagesCrawled, 77);
assert.equal(r.pagesAnalyzed, 77, "only the new pages are reviewed again");
assert.equal(r.gscMerged, true);
assert.ok(lastPlanInput.includes('"searchConsole"'), "the plan sees Search Console data");
assert.ok(lastPlanInput.includes("coupons/code-3") && lastPlanInput.includes('"before": 120'), "losses joined with verdicts");
assert.equal(buyerEmails().length, 1, "no second 'ready' email");

// A refresh only updates the figures.
await attachSearchConsole(id, { ...gscData, lostPages: 9 }, losses);
r = (await getDeepReport(id))!;
assert.equal(r.status, "done");
assert.equal(r.gsc!.lostPages, 9);

// Connected before the job starts: losing pages are crawled first.
const early = await startPaid("https://shop.test/");
await attachSearchConsole(early, gscData, losses);
r = (await runStep(early))!; // folds in (nothing crawled yet)
assert.equal(r.gscPending, false);
r = (await runStep(early))!; // discover
assert.deepEqual(
  r.urls!.slice(1, 8),
  losses.slice(0, 7).map((l) => l.url),
  "losing pages right after the homepage",
);
assert.equal(r.urls!.length, 77);

// Connected mid-crawl: the remaining losing pages jump the queue.
const mid = await startPaid("https://shop.test/");
r = (await runStep(mid))!; // discover
r = (await runStep(mid))!; // first crawl slice (40 pages)
assert.equal(r.crawlCursor, 31);
await attachSearchConsole(mid, gscData, losses);
r = (await runStep(mid))!;
const { pageKey } = await import("../src/lib/gsc/data");
const crawledKeys = new Set(r.urls!.slice(0, 31).map(pageKey));
const pending = losses.slice(0, 7).filter((l) => !crawledKeys.has(pageKey(l.url))).map((l) => l.url);
assert.deepEqual(r.urls!.slice(31, 31 + pending.length), pending, "losing pages not crawled yet go next");
assert.equal(new Set(r.urls!.map(pageKey)).size, r.urls!.length, "no duplicates");
assert.equal(r.crawlCursor, 31);

// Anti-bot firewall: caught before payment, and a job that hits it fails (refund + alert) instead of
// delivering a report built on a handful of pages.
const { discoverSite, probeCrawlable } = await import("../src/lib/check/crawl");
const fwSite = await discoverSite(new URL("https://fw.test/"));
assert.equal(fwSite.sitemapStatus, "unreadable", "a challenged sitemap is not a missing one");
assert.equal(fwSite.sitemapChallenged, true);
assert.ok(fwSite.pool.includes("https://fw.test/contact"), "www links count as the same site");
assert.equal((await probeCrawlable(fwSite)).blocked, true, "probe sees the challenge");
const fw = await startPaid("https://fw.test/");
for (let i = 0; i < 20; i++) {
  r = (await runStep(fw))!;
  if (r.status !== "running") break;
}
assert.equal(r.status, "failed", "low coverage fails instead of delivering");
assert.match(r.error ?? "", /anti-bot challenge/);
assert.ok((r.crawlErrors?.challenge ?? 0) >= 40, "reasons are recorded");
assert.ok(
  emails.some((e) => e.to === "hello@spamlyze.com" && e.subject.includes("failed: fw.test")),
  "admin alerted",
);

const apexSite = await discoverSite(new URL("https://apex.test/"));
assert.equal(apexSite.sitemapStatus, "found");
assert.equal(apexSite.sitemapUrlCount, 12, "www sitemap URLs kept and moved onto the apex origin");
assert.ok(apexSite.pool.every((u) => u.startsWith("https://apex.test/")));

// Small tier: the crawl stops at the tier's page cap, homepage included.
const small = await startPaid("https://shop.test/", { tier: "small", maxPages: 30, priceCents: 1400 });
r = (await runStep(small))!; // discover
assert.equal(r.urls!.length, 30, "capped at the tier's pages");
assert.equal(r.priceCents, 1400);

// Pricing tiers
const { tierFor, deepPricing } = await import("../src/lib/pricing");
assert.equal(tierFor(99), "small", "99 sitemap URLs + homepage = 100 pages");
assert.equal(tierFor(100), "large");
assert.equal(tierFor(null), "small", "no sitemap: small by default");
assert.equal(tierFor(null, true), "large", "the buyer can pick the large tier");
assert.equal(tierFor(20, true), "large");
Object.assign(process.env, {
  DEEP_REPORT_SMALL_PRICE_CENTS: "1900",
  DEEP_REPORT_PRICE_CENTS: "3900",
  PROMO_PERCENT_OFF: "25",
  PROMO_STARTS_AT: "2026-11-16T00:00:00+01:00",
  PROMO_ENDS_AT: "2026-12-01T00:00:00+01:00",
});
const during = Date.parse("2026-11-30T23:59:00+01:00");
const after = Date.parse("2026-12-01T00:00:00+01:00");
assert.equal(deepPricing(during, "small").cents, 1400, "$19 at -25% is $14");
assert.equal(deepPricing(during, "large").cents, 2900, "$39 at -25% is $29");
assert.equal(deepPricing(after, "small").cents, 1900);
assert.equal(deepPricing(after, "large").cents, 3900);
assert.equal(deepPricing(after, "large").promo, null);

console.log("all deep report tests passed", { steps: claudeCalls.length });
process.exit(0);
