// Test of the server-side Deep Report driver (Cloud Tasks) against the Firestore emulator, with a
// fake Cloud Tasks API, a fake website and a fake Claude API. Run with the emulator up:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:deep
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the Deep Report tasks test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";
process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.BREVO_API_KEY = "test-brevo";
process.env.API_KEY_PEPPER = "p".repeat(40);
delete process.env.DEEP_TASKS_QUEUE;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(dns as any).lookup = async () => [{ address: "93.184.215.14", family: 4 }];
syncBuiltinESMExports();

const html = (title: string, words: number) =>
  `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${Array.from({ length: words }, (_, i) => `w${i % 40}`).join(" ")}</p></main></body></html>`;
const sitemap = Array.from({ length: 30 }, (_, i) => `https://tasks.test/guides/guide-${i}`);

function claudeReply(body: { system: string; messages: { content: string }[] }) {
  const input = body.messages[0].content;
  let out: unknown;
  if (body.system.includes("one by one")) {
    const urls = [...input.matchAll(/"url": "([^"]+)"/g)].map((m) => m[1]).slice(1);
    out = { pages: urls.map((url) => ({ url, quality: "good", signals: [], note: "Useful guide." })) };
  } else if (body.system.includes("action plan")) {
    out = { actions: [{ title: "Keep going", priority: "later", effort: "low", signal: "scaled_content", why: "Fine.", steps: ["Nothing"], affectedPattern: "", affectedUrls: [] }] };
  } else {
    out = { riskScore: 10, riskLevel: "low", summary: "Fine.", signals: [] };
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

type Task = { name: string; scheduleTime: string; httpRequest: { url: string; headers: Record<string, string> } };
const queued: Task[] = [];
const names = new Set<string>();
let tasksApiStatus = 200;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url.startsWith("https://cloudtasks.googleapis.com/v2/")) {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
    if (tasksApiStatus !== 200) return new Response("nope", { status: tasksApiStatus });
    const { task } = JSON.parse(String(init?.body)) as { task: Task };
    if (names.has(task.name)) return new Response("exists", { status: 409 });
    names.add(task.name);
    queued.push(task);
    return Response.json(task);
  }
  if (url === "https://api.brevo.com/v3/smtp/email") return Response.json({ messageId: "x" }, { status: 201 });
  if (url.startsWith("https://api.anthropic.com/")) {
    const body = input instanceof Request ? await input.text() : String(init?.body);
    return claudeReply(JSON.parse(body));
  }
  const htmlHeaders = { headers: { "content-type": "text/html" } };
  if (url === "https://tasks.test/") return new Response(html("Garden guides", 600), htmlHeaders);
  if (url === "https://tasks.test/robots.txt") return new Response("User-agent: *\nSitemap: https://tasks.test/sitemap.xml\n");
  if (url === "https://tasks.test/sitemap.xml") return new Response(`<urlset>${sitemap.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`);
  if (url.includes("/guides/")) return new Response(html("Guide", 900), htmlHeaders);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const tasks = await import("../src/lib/deep/tasks");
tasks.taskDeps.accessToken = async () => "test-token";
const { createDeepReport, getDeepReport } = await import("../src/lib/deep/job");
const { POST: taskRoute } = await import("../src/app/api/internal/deep-step/[id]/route");
const { db } = await import("../src/lib/firebase-admin");

const deliver = (t: Task) => {
  const id = t.httpRequest.url.split("/").pop()!;
  return taskRoute(new Request(t.httpRequest.url, { method: "POST", headers: t.httpRequest.headers }), {
    params: Promise.resolve({ id }),
  } as never);
};

const id = await createDeepReport(new URL("https://tasks.test/"));
await db().collection("deepReports").doc(id).update({ status: "running", email: "buyer@example.com" });

// Off by default: nothing is sent to Cloud Tasks, the browser driver works as before.
assert.equal(await tasks.enqueueDeepStep(id), false);
assert.equal(queued.length, 0);

process.env.DEEP_TASKS_QUEUE = "deep-steps";
process.env.DEEP_TASKS_LOCATION = "europe-west1";

// Duplicates in the same 5 s window collapse into one task.
assert.equal(await tasks.enqueueDeepStep(id, 0), true);
assert.equal(await tasks.enqueueDeepStep(id, 0), true, "409 counts as scheduled");
assert.equal(queued.length, 1);
const first = queued[0];
assert.match(first.name, new RegExp(`^projects/demo-spamlyze/locations/europe-west1/queues/deep-steps/tasks/deep-${id}-\\d+$`));
assert.equal(first.httpRequest.url, `https://spamlyze.com/api/internal/deep-step/${id}`);

// The task endpoint refuses requests without the right token.
const bad = await taskRoute(new Request(first.httpRequest.url, { method: "POST", headers: { "x-spamlyze-task": "forged" } }), {
  params: Promise.resolve({ id }),
} as never);
assert.equal(bad.status, 404);
const other = await createDeepReport(new URL("https://tasks.test/"));
const stolen = await taskRoute(new Request(first.httpRequest.url, { method: "POST", headers: first.httpRequest.headers }), {
  params: Promise.resolve({ id: other }),
} as never);
assert.equal(stolen.status, 404, "a token only works for its own report");

// Simulate Cloud Tasks: deliver each queued task until the report is done, with no browser at all.
let delivered = 0;
while (queued.length && delivered < 40) {
  const t = queued.shift()!;
  names.clear(); // time "passes": the next window is free
  const res = await deliver(t);
  assert.equal(res.status, 200);
  delivered++;
}
const done = (await getDeepReport(id))!;
assert.equal(done.status, "done", `ended in ${done.status} after ${delivered} tasks: ${done.error}`);
assert.equal(done.pagesAnalyzed, 31);
assert.equal(queued.length, 0, "the chain stops once the report is done");

// If Cloud Tasks is down, enqueue says so without throwing (the page still drives the report).
tasksApiStatus = 503;
assert.equal(await tasks.enqueueDeepStep(id, 0), false);

console.log("deep tasks tests passed", { delivered });
process.exit(0);
