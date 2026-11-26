// Tests of the hosted MCP server (POST /mcp) against the Firestore emulator, with a fake Claude API,
// a fake Cloud Tasks API and fake websites. Run with the emulator up:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:api
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the MCP test");
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
process.env.NOTIFY_QUICK_CHECKS = "false";
process.env.DEEP_TASKS_QUEUE = "deep-steps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async () => [{ address: "93.184.215.14", family: 4 }];
syncBuiltinESMExports();

const html = (title: string, words: number) =>
  `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${Array.from({ length: words }, (_, i) => `w${i % 40}`).join(" ")}</p></main></body></html>`;
let claudeCalls = 0;

function claudeReply(body: { system: string; messages: { content: string }[] }) {
  claudeCalls++;
  const input = body.messages[0].content;
  let out: unknown;
  if (body.system.includes("one by one")) {
    const urls = [...input.matchAll(/"url": "([^"]+)"/g)].map((m) => m[1]).slice(1);
    out = { pages: urls.map((url) => ({ url, quality: "good", signals: [], note: "Useful guide." })) };
  } else if (body.system.includes("action plan")) {
    out = { actions: [{ title: "Keep going", priority: "later", effort: "low", signal: "scaled_content", why: "Fine.", steps: ["Nothing"], affectedPattern: "", affectedUrls: [] }] };
  } else if (body.system.includes("estimates how exposed")) {
    out = {
      riskScore: 22,
      riskLevel: "low",
      summary: "The sampled pages look like a normal site.",
      signals: [{ id: "scaled_content", level: "low", score: 22, finding: "Varied pages.", exampleUrls: [] }],
      topIssues: [{ title: "Add authors", why: "Trust.", fix: "Add bylines.", exampleUrls: [] }],
    };
  } else {
    out = { summary: "Fine.", signals: [{ id: "thin_doorway", level: "low", score: 12, finding: "A few short pages.", exampleUrls: [] }] };
  }
  return Response.json({
    id: "msg_test", type: "message", role: "assistant", model: "claude-haiku-5-5",
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
  if (url.startsWith("https://api.brevo.com/")) return Response.json({ messageId: "x" }, { status: 201 });
  if (url.startsWith("https://api.anthropic.com/")) {
    const body = input instanceof Request ? await input.text() : String(init?.body);
    return claudeReply(JSON.parse(body));
  }
  const u = new URL(url);
  const page = { headers: { "content-type": "text/html" } };
  if (u.pathname === "/robots.txt") return new Response(`User-agent: *\nSitemap: https://${u.hostname}/sitemap.xml\n`);
  if (u.pathname === "/sitemap.xml") {
    return new Response(`<urlset>${Array.from({ length: 12 }, (_, i) => `<url><loc>https://${u.hostname}/guides/g-${i}</loc></url>`).join("")}</urlset>`);
  }
  if (u.pathname === "/" || u.pathname.startsWith("/guides/")) return new Response(html("Garden guides", 700), page);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const tasks = await import("../src/lib/deep/tasks");
tasks.taskDeps.accessToken = async () => "test-token";
const { accounts, createApiAccount } = await import("../src/lib/api/accounts");
const { createApiKey, revokeApiKey } = await import("../src/lib/api/keys");
const { addCredits } = await import("../src/lib/api/credits");
const mcpRoute = await import("../src/app/api/mcp/route");
const { POST: taskRoute } = await import("../src/app/api/internal/deep-step/[id]/route");
const { db } = await import("../src/lib/firebase-admin");

const acct = await createApiAccount({ email: "m@example.com", name: "MCP user" });
const { key, keyId } = await createApiKey(acct, "claude desktop");
const bal = async () => (await accounts().doc(acct).get()).get("balanceCents") as number;

let nextId = 1;
const send = (msg: unknown, k: string | null = key) =>
  mcpRoute.POST(
    new Request("https://spamlyze.com/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(k ? { authorization: `Bearer ${k}` } : {}) },
      body: typeof msg === "string" ? msg : JSON.stringify(msg),
    }),
  );
type Rpc = { jsonrpc: string; id: number | null; result?: Record<string, unknown> & { isError?: boolean; content?: { type: string; text: string }[]; structuredContent?: Record<string, unknown> }; error?: { code: number; message: string } };
const rpc = async (method: string, params?: unknown, k?: string | null) => {
  const r = await send({ jsonrpc: "2.0", id: nextId++, method, params }, k);
  return { status: r.status, headers: r.headers, body: (await r.json()) as Rpc };
};
const call = async (name: string, args: Record<string, unknown> = {}) => (await rpc("tools/call", { name, arguments: args })).body.result!;

// No key, a wrong key, a revoked key: 401 with WWW-Authenticate, and not even the tool list.
let r = await rpc("tools/list", undefined, null);
assert.equal(r.status, 401);
assert.match(r.headers.get("www-authenticate") ?? "", /^Bearer /);
r = await rpc("initialize", {}, "spz_live_nope");
assert.equal(r.status, 401);

// GET (SSE stream) and DELETE (sessions) are not offered.
assert.equal((await mcpRoute.GET()).status, 405);
assert.equal((await mcpRoute.DELETE()).status, 405);

// Handshake: our version when the client asks for an unknown one, the client's when we support it.
r = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
assert.equal(r.status, 200);
assert.equal(r.body.result?.protocolVersion, "2025-06-18");
assert.deepEqual((r.body.result?.serverInfo as { name: string }).name, "spamlyze");
assert.ok((r.body.result?.capabilities as { tools: unknown }).tools);
r = await rpc("initialize", { protocolVersion: "1999-01-01" });
assert.equal(r.body.result?.protocolVersion, "2025-11-25");

// A notification gets 202 with no body.
const n = await send({ jsonrpc: "2.0", method: "notifications/initialized" });
assert.equal(n.status, 202);
assert.equal(await n.text(), "");

// Malformed messages.
assert.equal((await send("{nope")).status, 400);
assert.equal((await send([{ jsonrpc: "2.0", id: 1, method: "ping" }])).status, 400, "no batches");
assert.equal((await rpc("resources/list")).body.error?.code, -32601);
assert.deepEqual((await rpc("ping")).body.result, {});

// Tools.
const list = (await rpc("tools/list")).body.result!.tools as { name: string; inputSchema: { required?: string[] } }[];
assert.deepEqual(list.map((t) => t.name), ["quick_check", "start_deep_report", "get_deep_report", "get_balance"]);
assert.deepEqual(list[0].inputSchema.required, ["url"]);
assert.equal((await rpc("tools/call", { name: "nope", arguments: {} })).body.error?.code, -32602);

// get_balance is free and matches GET /v1/account.
let res = await call("get_balance");
assert.equal(res.isError, undefined);
assert.deepEqual((res.structuredContent as { balance: unknown }).balance, { cents: 0, currency: "usd" });
assert.equal((res.structuredContent as { prices: { quickCheck: { cents: number } } }).prices.quickCheck.cents, 15);

// Paid tools with no credits: a tool error (not a protocol error), nothing run.
res = await call("quick_check", { url: "garden.test" });
assert.equal(res.isError, true);
assert.match(res.content![0].text, /insufficient_credits/);
assert.equal(claudeCalls, 0);

await addCredits(acct, 2000, "manual", "mcp-1");

// Bad arguments are refused before anything is charged.
res = await call("quick_check", { url: "garden.test", hitBySpamUpdate: "maybe" });
assert.equal(res.isError, true);
res = await call("quick_check", { url: "localhost" });
assert.match(res.content![0].text, /invalid_url/);
assert.equal(await bal(), 2000);

// quick_check: same result and same price as POST /v1/checks.
res = await call("quick_check", { url: "https://garden.test/", hitBySpamUpdate: "no" });
assert.equal(res.isError, undefined, res.content?.[0].text);
const check = res.structuredContent as { id: string; riskScore: number; charged: { cents: number }; coverage: { message: string } };
assert.equal(check.riskScore, 22);
assert.equal(check.charged.cents, 15);
assert.ok(check.coverage.message, "the coverage warning reaches the agent");
assert.equal(JSON.parse(res.content![0].text).id, check.id, "text content carries the same JSON");
assert.equal(await bal(), 1985);
const stored = (await db().collection("checks").doc(check.id).get()).data()!;
assert.equal(stored.source, "api");
assert.equal(stored.accountId, acct);

// start_deep_report: $12, then get_deep_report follows it to the end for free.
res = await call("start_deep_report", { url: "garden.test", maxPages: 20 });
assert.equal(res.isError, undefined, res.content?.[0].text);
const started = res.structuredContent as { id: string; status: string };
assert.equal(started.status, "running");
assert.equal(await bal(), 785);
for (let i = 0; i < 40 && queued.length; i++) {
  const t = queued.shift()!;
  if (!t.httpRequest.url.includes("/internal/deep-step/")) continue;
  const req = new Request(t.httpRequest.url, { method: "POST", headers: t.httpRequest.headers });
  assert.equal((await taskRoute(req, { params: Promise.resolve({ id: t.httpRequest.url.split("/").at(-1)! }) } as never)).status, 200);
}
res = await call("get_deep_report", { id: started.id });
assert.equal((res.structuredContent as { status: string }).status, "done", res.content?.[0].text);
res = await call("get_deep_report", { id: started.id, pages: true });
assert.ok(Array.isArray((res.structuredContent as { pages?: unknown[] }).pages));
assert.equal(await bal(), 785, "reading is free");
res = await call("get_deep_report", { id: "someone-elses" });
assert.equal(res.isError, true);
res = await call("get_deep_report", {});
assert.equal(res.isError, true);

// The budget guard applies to MCP too.
process.env.API_DAILY_CLAUDE_BUDGET_USD = "0";
res = await call("quick_check", { url: "other.test" });
assert.match(res.content![0].text, /budget_exhausted/);
delete process.env.API_DAILY_CLAUDE_BUDGET_USD;

// Stats: tool calls are counted.
const day = new Date().toISOString().slice(0, 10);
assert.ok(((await db().collection("stats").doc(day).get()).get("apiMcpToolCalls") as number) >= 10);

// A revoked key stops working at once.
await revokeApiKey(keyId);
assert.equal((await rpc("tools/list")).status, 401);

console.log("mcp tests passed");
process.exit(0);
