// Tests of POST /v1/reports and GET /v1/reports/{id} against the Firestore emulator, with a fake
// Cloud Tasks API, fake websites and a fake Claude API. Run with the emulator up:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:api
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the API reports test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";
const realFetch = globalThis.fetch;
await realFetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/databases/(default)/documents`,
  { method: "DELETE" },
);
process.env.API_KEY_PEPPER = "x".repeat(40);
process.env.API_ENABLED = "true";
process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.BREVO_API_KEY = "test-brevo";
delete process.env.DEEP_TASKS_QUEUE;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async () => [{ address: "93.184.215.14", family: 4 }];
syncBuiltinESMExports();

const html = (title: string, words: number) =>
  `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${Array.from({ length: words }, (_, i) => `w${i % 40}`).join(" ")}</p></main></body></html>`;
const sitemap = (host: string) => Array.from({ length: 20 }, (_, i) => `https://${host}/guides/guide-${i}`);
let breakSite = "";

function claudeReply(body: { system: string; messages: { content: string }[] }) {
  const input = body.messages[0].content;
  let out: unknown;
  if (body.system.includes("one by one")) {
    const urls = [...input.matchAll(/"url": "([^"]+)"/g)].map((m) => m[1]).slice(1);
    out = { pages: urls.map((url) => ({ url, quality: "good", signals: [], note: "Useful guide." })) };
  } else if (body.system.includes("action plan")) {
    out = { actions: [{ title: "Keep going", priority: "later", effort: "low", signal: "scaled_content", why: "Fine.", steps: ["Nothing"], affectedPattern: "", affectedUrls: [] }] };
  } else {
    out = { riskScore: 12, riskLevel: "low", summary: "Fine.", signals: [] };
  }
  return Response.json({
    id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(out) }], stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
}

type Task = { name: string; httpRequest: { url: string; headers: Record<string, string> } };
const queued: Task[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url.startsWith("https://cloudtasks.googleapis.com/v2/")) {
    const { task } = JSON.parse(String(init?.body)) as { task: Task };
    if (queued.some((t) => t.name === task.name)) return new Response("exists", { status: 409 });
    queued.push(task);
    return Response.json(task);
  }
  if (url === "https://api.brevo.com/v3/smtp/email") return Response.json({ messageId: "x" }, { status: 201 });
  if (url.startsWith("https://api.anthropic.com/")) {
    const body = input instanceof Request ? await input.text() : String(init?.body);
    return claudeReply(JSON.parse(body));
  }
  const u = new URL(url);
  const page = { headers: { "content-type": "text/html" } };
  if (u.hostname === breakSite) return new Response("oops", { status: 500 });
  if (u.pathname === "/robots.txt") {
    return new Response(u.hostname === "norobots.test" ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nSitemap: https://${u.hostname}/sitemap.xml\n`);
  }
  if (u.pathname === "/sitemap.xml") return new Response(`<urlset>${sitemap(u.hostname).map((x) => `<url><loc>${x}</loc></url>`).join("")}</urlset>`);
  if (u.pathname === "/") return new Response(html("Garden guides", 600), page);
  if (u.pathname.startsWith("/guides/")) return new Response(html("Guide", 900), page);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const tasks = await import("../src/lib/deep/tasks");
tasks.taskDeps.accessToken = async () => "test-token";
const { accounts, createApiAccount } = await import("../src/lib/api/accounts");
const { createApiKey } = await import("../src/lib/api/keys");
const { addCredits, listLedger } = await import("../src/lib/api/credits");
const { POST: createReport } = await import("../src/app/api/v1/reports/route");
const { GET: readReport } = await import("../src/app/api/v1/reports/[id]/route");
const { POST: taskRoute } = await import("../src/app/api/internal/deep-step/[id]/route");

const acct = await createApiAccount({ email: "r@example.com", name: "Agency R" });
const { key } = await createApiKey(acct, "reports");
const bal = async () => (await accounts().doc(acct).get()).get("balanceCents") as number;
const post = (body: unknown, k = key) =>
  createReport(new Request("https://spamlyze.com/api/v1/reports", {
    method: "POST", headers: { authorization: `Bearer ${k}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }));
const read = (id: string, query = "", k = key) =>
  readReport(new Request(`https://spamlyze.com/api/v1/reports/${id}${query}`, { headers: { authorization: `Bearer ${k}` } }), {
    params: Promise.resolve({ id }),
  } as never);
type Body = Record<string, unknown> & { id: string; status: string; error?: { code: string } | string | null; refunded: boolean; balance: { cents: number } };
const json = async (r: Response) => (await r.json()) as Body;
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
async function drain() {
  for (let i = 0; i < 60 && queued.length; i++) {
    const t = queued.shift()!;
    const id = t.httpRequest.url.split("/").pop()!;
    const res = await taskRoute(new Request(t.httpRequest.url, { method: "POST", headers: t.httpRequest.headers }), { params: Promise.resolve({ id }) } as never);
    assert.equal(res.status, 200);
  }
}

// Without the server driver the API refuses Deep Reports (they would never advance).
let r = await post({ url: "garden.test" });
assert.equal(r.status, 503);
process.env.DEEP_TASKS_QUEUE = "deep-steps";

// Bad input, then no credits: refused, nothing charged.
r = await post({ url: "localhost" });
assert.equal(await code(r), "invalid_url");
r = await post({ url: "garden.test", maxPages: 5000 });
assert.equal(await code(r), "invalid_max_pages");
r = await post({ url: "garden.test" });
assert.equal(r.status, 402);
assert.equal(await code(r), "insufficient_credits");

await addCredits(acct, 5000, "manual", "t1");

// robots.txt blocks us: refused before charging.
r = await post({ url: "norobots.test" });
assert.equal(r.status, 422);
assert.equal(await code(r), "robots_blocked");
assert.equal(await bal(), 5000);

// A real report: 202 at once, charged $12, then the queue drives it to the end.
r = await post({ url: "https://garden.test/", maxPages: 50 });
assert.equal(r.status, 202);
const created = await json(r);
assert.equal(created.status, "running");
assert.equal(created.balance.cents, 3800);
assert.equal(r.headers.get("location"), `https://spamlyze.com/v1/reports/${created.id}`);
assert.equal(queued.length, 1);
await drain();
r = await read(created.id);
const done = await json(r);
assert.equal(done.status, "done", JSON.stringify(done.error));
assert.equal((done.analysis as { riskScore: number }).riskScore, 12);
assert.equal(done.pages, undefined);
assert.equal((done.progress as { pagesAnalyzed: number }).pagesAnalyzed, 21);
r = await read(created.id, "?pages=true");
const withPages = await json(r);
assert.equal((withPages.pages as unknown[]).length, 21);
assert.equal(await bal(), 3800, "reading is free");

// Same domain within the hour: 429, not charged.
r = await post({ url: "garden.test" });
assert.equal(r.status, 429);
assert.equal(await code(r), "domain_cooldown");
assert.ok(Number(r.headers.get("retry-after")) > 3000);
assert.equal(await bal(), 3800);

// Other accounts can't read it.
const other = await createApiAccount({ email: "o@example.com", name: "O" });
const { key: otherKey } = await createApiKey(other, "o");
assert.equal((await read(created.id, "", otherKey)).status, 404);
assert.equal((await read("not-an-id")).status, 404);

// The site breaks after the check: the job fails and the $12 come back automatically.
r = await post({ url: "flaky.test" });
const flaky = await json(r);
assert.equal(r.status, 202);
assert.equal(await bal(), 2600);
breakSite = "flaky.test";
await drain();
const failed = await json(await read(flaky.id));
assert.equal(failed.status, "failed");
assert.equal(failed.refunded, true);
assert.equal(await bal(), 3800);
breakSite = "";

// Running cap per account: the second report waits, nothing charged.
process.env.API_MAX_RUNNING_REPORTS = "1";
r = await post({ url: "one.test" });
assert.equal(r.status, 202);
queued.length = 0; // leave it running
r = await post({ url: "two.test" });
assert.equal(r.status, 429);
assert.equal(await code(r), "too_many_running");
assert.equal(await bal(), 2600);
delete process.env.API_MAX_RUNNING_REPORTS;

// The ledger matches the balance.
const ledger = await listLedger(acct, 50);
assert.equal(ledger.reduce((s, e) => s + e.cents, 0), await bal());
assert.equal(ledger.filter((e) => e.type === "refund").length, 1);

console.log("api reports tests passed");
process.exit(0);
