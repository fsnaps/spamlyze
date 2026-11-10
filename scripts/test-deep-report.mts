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
  if (url.includes("/coupons/")) return new Response(html("Coupon code", 80, '<a href="https://aff.example/x" rel="sponsored">deal</a>'), htmlHeaders);
  if (url === "https://down.test/") return new Response("oops", { status: 500 });
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const { createDeepReport, getDeepPages, getDeepReport, runStep } = await import("../src/lib/deep/job");
const { db } = await import("../src/lib/firebase-admin");

async function startPaid(url: string) {
  const id = await createDeepReport(new URL(url));
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

assert.equal(emails.length, 1, "one 'ready' email");
assert.equal(emails[0].to, "buyer@example.com");
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
assert.equal(emails.length, 1, "no 'ready' email for a failed report");

console.log("all deep report tests passed", { steps: claudeCalls.length, usage: r.usage });
process.exit(0);
