// Tests of Search Console in API Deep Reports (connect link, searchConsole "wait", timeouts,
// report.updated) against the Firestore emulator, with fake Cloud Tasks, sites and Claude. Run with the emulator up:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:api
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the API Search Console test");
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
process.env.DEEP_TASKS_QUEUE = "deep-steps";
process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async () => [{ address: "93.184.215.14", family: 4 }];
syncBuiltinESMExports();

const html = (title: string, words: number) =>
  `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${Array.from({ length: words }, (_, i) => `w${i % 40}`).join(" ")}</p></main></body></html>`;
const sitemap = (host: string) => Array.from({ length: 20 }, (_, i) => `https://${host}/guides/guide-${i}`);
const breakSite = "";
const hooks: { headers: Headers; body: string }[] = [];
const hookStatus = 200;

let claudeCalls = 0;
let siteFetches = 0;
function claudeReply(body: { system: string; messages: { content: string }[] }) {
  claudeCalls++;
  const input = body.messages[0].content;
  let out: unknown;
  if (body.system.includes("one by one")) {
    const urls = [...input.matchAll(/"url": "([^"]+)"/g)].map((m) => m[1]).slice(1);
    out = { pages: urls.map((url) => ({ url, quality: "good", signals: [], note: "Useful guide." })) };
  } else if (body.system.includes("action plan")) {
    out = { actions: [{ title: "Keep going", priority: "later", effort: "low", signal: "scaled_content", why: "Fine.", steps: ["Nothing"], affectedPattern: "", affectedUrls: [] }] };
  } else {
    out = { summary: "Fine.", signals: [{ id: "thin_doorway", level: "low", score: 12, finding: "A few short pages.", exampleUrls: [] }] };
  }
  return Response.json({
    id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(out) }], stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
}

type Task = { name: string; scheduleTime?: string; httpRequest: { url: string; headers: Record<string, string> } };
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
  if (u.hostname === "hooks.test") {
    hooks.push({ headers: new Headers(init?.headers), body: String(init?.body) });
    return new Response("ok", { status: hookStatus });
  }
  const page = { headers: { "content-type": "text/html" } };
  siteFetches++;
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
const { addCredits } = await import("../src/lib/api/credits");
const { POST: createReport } = await import("../src/app/api/v1/reports/route");
const { GET: readReport } = await import("../src/app/api/v1/reports/[id]/route");
const { POST: taskRoute } = await import("../src/app/api/internal/deep-step/[id]/route");
const { POST: webhookTask } = await import("../src/app/api/internal/webhook/[account]/[event]/route");
const webhookApi = await import("../src/app/api/v1/webhook/route");

const acct = await createApiAccount({ email: "r@example.com", name: "Agency R" });
const { key } = await createApiKey(acct, "reports");
const bal = async () => (await accounts().doc(acct).get()).get("balanceCents") as number;
const post = (body: unknown, k = key, idem?: string) =>
  createReport(new Request("https://spamlyze.com/api/v1/reports", {
    method: "POST",
    headers: { authorization: `Bearer ${k}`, "content-type": "application/json", ...(idem ? { "idempotency-key": idem } : {}) },
    body: JSON.stringify(body),
  }));
const hookReq = (method: string, body?: unknown) =>
  new Request("https://spamlyze.com/api/v1/webhook", {
    method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
const read = (id: string, query = "", k = key) =>
  readReport(new Request(`https://spamlyze.com/api/v1/reports/${id}${query}`, { headers: { authorization: `Bearer ${k}` } }), {
    params: Promise.resolve({ id }),
  } as never);
type Body = Record<string, unknown> & { id: string; status: string; error?: { code: string } | string | null; refunded: boolean; balance: { cents: number } };
const json = async (r: Response) => (await r.json()) as Body;
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
/** Delivers queued tasks. Webhook retries only when asked (Cloud Tasks would wait minutes first). */
async function drain(webhooks = true) {
  const held: Task[] = [];
  for (let i = 0; i < 60 && queued.length; i++) {
    const t = queued.shift()!;
    if (!webhooks && t.httpRequest.url.includes("/internal/webhook/") && t.name.match(/-[1-9]\d*$/)) {
      held.push(t);
      continue;
    }
    const parts = t.httpRequest.url.split("/");
    const req = new Request(t.httpRequest.url, { method: "POST", headers: t.httpRequest.headers });
    const res = t.httpRequest.url.includes("/internal/webhook/")
      ? await webhookTask(req, { params: Promise.resolve({ account: parts.at(-2)!, event: parts.at(-1)! }) } as never)
      : await taskRoute(req, { params: Promise.resolve({ id: parts.at(-1)! }) } as never);
    assert.equal(res.status, 200);
  }
  queued.push(...held);
}

const { attachSearchConsole } = await import("../src/lib/deep/job");
const { db } = await import("../src/lib/firebase-admin");

await addCredits(acct, 5000, "manual", "gsc-1");
let r: Response;
r = await webhookApi.PUT(hookReq("PUT", { url: "https://hooks.test/spamlyze" }));
assert.equal(r.status, 200);

const gscFor = (host: string) => ({
  property: `sc-domain:${host}`,
  importedAt: new Date().toISOString(),
  daily: [],
  updates: [],
  losers: { update: "March 2026 spam update", pages: [{ url: `https://${host}/guides/guide-3`, before: 120, after: 10 }] },
  lostPages: 2,
});
const lossesFor = (host: string) => [
  { url: `https://${host}/guides/guide-3`, before: 120, after: 10 },
  { url: `https://${host}/guides/guide-7`, before: 80, after: 5 },
];
type Sc = { connected: boolean; connectUrl: string | null; waitUntil: string | null; onTimeout: string | null; worstUpdate: string | null; pagesThatLostClicks: number | null };
const sc = (b: Body) => b.searchConsole as Sc;

// Bad options: 400, not charged.
assert.equal(await code(await post({ url: "wait.test", searchConsole: "yes" })), "invalid_search_console");
assert.equal(await code(await post({ url: "wait.test", searchConsole: "wait", onSearchConsoleTimeout: "refund" })), "invalid_search_console");
assert.equal(await bal(), 5000);

// Default mode: starts at once, and the response carries the link to connect Search Console.
r = await post({ url: "now.test", maxPages: 20 });
assert.equal(r.status, 202);
const now = await json(r);
assert.equal(now.status, "running");
assert.equal(sc(now).connected, false);
assert.equal(sc(now).connectUrl, `https://spamlyze.com/api/gsc/connect?deep=${now.id}`);
assert.equal(sc(now).waitUntil, null);
await drain();
assert.equal((await json(await read(now.id))).status, "done");
assert.equal(hooks.filter((h) => JSON.parse(h.body).type === "report.done").length, 1);

// The owner connects later: the report reopens, reviews the losing pages and sends report.updated once.
await attachSearchConsole(now.id, gscFor("now.test"), lossesFor("now.test"));
assert.equal((await json(await read(now.id))).status, "running");
await drain();
let after = await json(await read(now.id));
assert.equal(after.status, "done");
assert.equal(sc(after).connected, true);
assert.equal(sc(after).connectUrl, null, "no link once connected");
assert.equal(sc(after).worstUpdate, "March 2026 spam update");
assert.equal(sc(after).pagesThatLostClicks, 2);
assert.equal(hooks.filter((h) => JSON.parse(h.body).type === "report.updated").length, 1);
assert.equal(hooks.filter((h) => JSON.parse(h.body).type === "report.done").length, 1, "no second report.done");
assert.equal(await bal(), 3800, "the update is free");

// Wait mode: charged, but nothing is crawled or analyzed until Search Console is connected.
const before = { claude: claudeCalls, site: siteFetches };
r = await post({ url: "wait.test", maxPages: 20, searchConsole: "wait", onSearchConsoleTimeout: "cancel" });
assert.equal(r.status, 202);
const waiting = await json(r);
assert.equal(waiting.status, "waiting_for_search_console");
assert.equal(await bal(), 2600);
assert.equal(sc(waiting).onTimeout, "cancel");
assert.ok(sc(waiting).connectUrl);
const deadline = Date.parse(sc(waiting).waitUntil!);
assert.ok(Math.abs(deadline - (Date.now() + 72 * 3_600_000)) < 60_000, "72 h");
const task = queued.find((t) => t.httpRequest.url.endsWith(waiting.id))!;
assert.ok(Date.parse(task.scheduleTime!) >= deadline, "one task at the deadline");
const probe = siteFetches - before.site;
await drain(); // the deadline task, run early, must not start it
assert.equal((await json(await read(waiting.id))).status, "waiting_for_search_console");
assert.equal(claudeCalls, before.claude, "no Claude call while waiting");
assert.equal(siteFetches - before.site, probe, "no crawl while waiting (only the checkout probe)");

// Connected: it starts with the losing pages first and ends like any report.
await attachSearchConsole(waiting.id, gscFor("wait.test"), lossesFor("wait.test"));
await drain();
const started = await json(await read(waiting.id));
assert.equal(started.status, "done");
assert.equal(sc(started).connected, true);
assert.equal(sc(started).waitUntil, null);
const crawled = ((await db().collection("deepReports").doc(waiting.id).get()).get("urls") as string[]).slice(1, 3);
assert.deepEqual(crawled, ["https://wait.test/guides/guide-3", "https://wait.test/guides/guide-7"], "losing pages crawled first");
assert.equal(hooks.filter((h) => JSON.parse(h.body).data.id === waiting.id && JSON.parse(h.body).type === "report.done").length, 1);

// Timeout with "cancel": the $12 go back to the balance, report.failed is sent.
r = await post({ url: "cancel.test", searchConsole: "wait", onSearchConsoleTimeout: "cancel" });
const cancel = await json(r);
assert.equal(await bal(), 1400);
await db().collection("deepReports").doc(cancel.id).update({ "gscWait.until": Date.now() - 1000 });
await drain();
let c = await json(await read(cancel.id));
assert.equal(c.status, "failed");
assert.equal(c.refunded, true);
assert.match(String(c.error), /not connected in time/);
assert.equal(sc(c).connectUrl, null);
assert.equal(await bal(), 2600);
assert.equal(hooks.filter((h) => JSON.parse(h.body).data.id === cancel.id && JSON.parse(h.body).type === "report.failed").length, 1);
// Connecting after the cancel does not restart it.
await attachSearchConsole(cancel.id, gscFor("cancel.test"), lossesFor("cancel.test"));
queued.length = 0;
c = await json(await read(cancel.id));
assert.equal(c.status, "failed");

// Timeout with "run" (default): starts without Search Console. GET applies it if the task never ran.
r = await post({ url: "run.test", maxPages: 20, searchConsole: "wait" });
const run = await json(r);
assert.equal(sc(run).onTimeout, "run");
queued.length = 0; // the deadline task is lost
await db().collection("deepReports").doc(run.id).update({ "gscWait.until": Date.now() - 1000 });
assert.equal((await json(await read(run.id))).status, "running", "GET is the safety net");
await drain();
after = await json(await read(run.id));
assert.equal(after.status, "done");
assert.equal(sc(after).connected, false);
assert.ok(sc(after).connectUrl, "can still be connected afterwards");
assert.equal(await bal(), 1400);

// Waiting cap per account.
process.env.API_MAX_WAITING_REPORTS = "0";
r = await post({ url: "cap.test", searchConsole: "wait" });
assert.equal(await code(r), "too_many_waiting");
delete process.env.API_MAX_WAITING_REPORTS;
assert.equal(await bal(), 1400);

console.log("api search console tests passed");
process.exit(0);
