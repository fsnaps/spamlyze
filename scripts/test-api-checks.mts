// Tests of POST /v1/checks and GET /v1/checks/{id} against the Firestore emulator, with a fake
// website and a fake Claude API. Run with the emulator up:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:api
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the API checks test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";
// Start from an empty database: the 24 h domain cache would otherwise leak between runs.
const realFetch = globalThis.fetch;
await realFetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/databases/(default)/documents`,
  { method: "DELETE" },
);
process.env.API_KEY_PEPPER = "x".repeat(40);
process.env.API_ENABLED = "true";
process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.NOTIFY_QUICK_CHECKS = "false";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async () => [{ address: "93.184.215.14", family: 4 }];
syncBuiltinESMExports();

const html = (title: string, words: number) =>
  `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${Array.from({ length: words }, (_, i) => `w${i % 40}`).join(" ")}</p></main></body></html>`;
let claudeCalls = 0;
let claudeDown = false;
let slowSite: Promise<void> | null = null;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url.startsWith("https://api.anthropic.com/")) {
    claudeCalls++;
    if (claudeDown) return Response.json({ type: "error", error: { type: "api_error", message: "down" } }, { status: 500 });
    const out = {
      riskScore: 22,
      riskLevel: "low",
      summary: "The sampled pages look like a normal site.",
      signals: [{ id: "scaled_content", level: "low", score: 22, finding: "Varied pages.", exampleUrls: [] }],
      topIssues: [{ title: "Add authors", why: "Trust.", fix: "Add bylines.", exampleUrls: [] }],
    };
    return Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: JSON.stringify(out) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 9000, output_tokens: 2500 },
    });
  }
  const page = { headers: { "content-type": "text/html" } };
  if (url.endsWith("/robots.txt")) {
    if (url.startsWith("https://norobots.test")) return new Response("User-agent: *\nDisallow: /\n");
    return new Response("User-agent: *\n");
  }
  if (url.startsWith("https://slow.test/") && slowSite) await slowSite;
  if (url.startsWith("https://down.test/")) return new Response("oops", { status: 500 });
  return new Response(html("Garden guides", 600), page);
}) as typeof fetch;

const { accounts, createApiAccount } = await import("../src/lib/api/accounts");
const { createApiKey } = await import("../src/lib/api/keys");
const { addCredits, listLedger } = await import("../src/lib/api/credits");
const { POST: createCheck } = await import("../src/app/api/v1/checks/route");
const { GET: readCheck } = await import("../src/app/api/v1/checks/[id]/route");
const { db } = await import("../src/lib/firebase-admin");

const acct = await createApiAccount({ email: "c@example.com", name: "C" });
const { key } = await createApiKey(acct, "checks");
const bal = async () => (await accounts().doc(acct).get()).get("balanceCents") as number;
const post = (body: unknown, k = key, idem?: string) =>
  createCheck(
    new Request("https://spamlyze.com/api/v1/checks", {
      method: "POST",
      headers: { authorization: `Bearer ${k}`, "content-type": "application/json", ...(idem ? { "idempotency-key": idem } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const read = (id: string, k = key) =>
  readCheck(new Request(`https://spamlyze.com/api/v1/checks/${id}`, { headers: { authorization: `Bearer ${k}` } }), {
    params: Promise.resolve({ id }),
  } as never);
type Body = { id: string; error?: { code: string; message: string }; cached: boolean; riskScore: number; balance: { cents: number }; charged: { cents: number }; reportUrl: string; note: string };
const json = async (r: Response) => (await r.json()) as Body;

// No credits: 402 before any crawl or Claude call.
let r = await post({ url: "garden.test" });
assert.equal(r.status, 402);
assert.equal((await json(r)).error?.code, "insufficient_credits");
assert.equal(claudeCalls, 0);

await addCredits(acct, 100, "manual", "t1");

// Bad input: 400, not charged.
for (const bad of [{ url: "localhost" }, { url: 42 }, {}]) {
  r = await post(bad);
  assert.equal(r.status, 400, JSON.stringify(bad));
  assert.equal((await json(r)).error?.code, "invalid_url");
}
r = await post("not json");
assert.equal((await json(r)).error?.code, "invalid_body");
assert.equal(await bal(), 100);

// A real check: 201, charged $0.15, stored as an API check.
r = await post({ url: "https://garden.test/" });
assert.equal(r.status, 201);
const first = await json(r);
assert.equal(first.cached, false);
assert.equal(first.riskScore, 22);
assert.deepEqual(first.charged, { cents: 15, currency: "usd" });
assert.equal(first.balance.cents, 85);
assert.ok(first.reportUrl.endsWith(`/report/${first.id}`));
assert.match(first.note, /Estimate/);
assert.equal(claudeCalls, 1);
const stored = (await db().collection("checks").doc(first.id).get()).data()!;
assert.equal(stored.source, "api");
assert.equal(stored.accountId, acct);

// Same domain within 24 h: served from cache, still charged, no new Claude call.
r = await post({ url: "garden.test" });
const second = await json(r);
assert.equal(r.status, 201);
assert.equal(second.cached, true);
assert.equal(second.id, first.id);
assert.equal(second.balance.cents, 70);
assert.equal(claudeCalls, 1);

// Idempotency-Key: the retry replays the first answer, charged once.
r = await post({ url: "garden.test" }, key, "job-1");
const third = await json(r);
assert.equal(third.balance.cents, 55);
r = await post({ url: "garden.test" }, key, "job-1");
assert.equal(r.headers.get("idempotent-replayed"), "true");
assert.equal((await json(r)).id, third.id);
assert.equal(await bal(), 55, "not charged twice");
await addCredits(acct, 30, "manual", "t-idem");

// GET: free, only for this account's checks.
r = await read(first.id);
assert.equal(r.status, 200);
assert.equal((await json(r)).riskScore, 22);
assert.equal(await bal(), 85);
const other = await createApiAccount({ email: "d@example.com", name: "D" });
const { key: otherKey } = await createApiKey(other, "other");
r = await read(first.id, otherKey);
assert.equal(r.status, 404);
r = await read("nope");
assert.equal(r.status, 404);

// Site down, robots.txt blocked, Claude down: 422, refunded every time.
const before = await bal();
r = await post({ url: "down.test" });
assert.equal(r.status, 422);
assert.equal((await json(r)).error?.code, "analysis_failed");
r = await post({ url: "norobots.test" });
assert.equal(r.status, 422);
assert.equal((await json(r)).error?.code, "robots_blocked");
claudeDown = true;
r = await post({ url: "other.test" });
assert.equal(r.status, 422);
assert.match((await json(r)).error!.message, /not charged/);
claudeDown = false;
assert.equal(await bal(), before, "all three refunded");
const ledger = await listLedger(acct, 50);
assert.equal(ledger.filter((e) => e.type === "refund").length, 3);
assert.equal(ledger.reduce((s, e) => s + e.cents, 0), await bal());

// Concurrency: at most 3 checks in flight per account (test: 2).
process.env.API_MAX_CONCURRENT_CHECKS = "2";
let release!: () => void;
slowSite = new Promise((res) => (release = res));
const pending = [post({ url: "slow.test" }), post({ url: "slow.test" })];
for (let i = 0; i < 50; i++) {
  const slots = (await db().collection("apiInflight").doc(acct).get()).get("slots") ?? {};
  if (Object.keys(slots).length >= 2) break;
  await new Promise((res) => setTimeout(res, 100));
}
r = await post({ url: "slow.test" });
assert.equal(r.status, 429);
assert.equal((await json(r)).error?.code, "too_many_concurrent");
release();
const done = await Promise.all(pending);
assert.ok(done.every((d) => d.status === 201), `statuses ${done.map((d) => d.status)}`);
// Slots are released: a new check can start.
r = await post({ url: "slow.test" });
assert.equal(r.status, 201);
delete process.env.API_MAX_CONCURRENT_CHECKS;

console.log("api checks tests passed");
process.exit(0);
