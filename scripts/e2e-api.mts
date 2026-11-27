// End-to-end smoke test of the API, the MCP server and the site over real HTTP, against a running
// server (next start) and the Firestore emulator. It never calls Claude, Stripe or a third-party site.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 API_KEY_PEPPER=… npx next start -p 3123
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 API_KEY_PEPPER=… BASE_URL=http://localhost:3123 npm run e2e:api
// Use the same API_KEY_PEPPER for both. The seeded account is "beta", so API_ENABLED can stay false.
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL;
if (!BASE || !process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set BASE_URL and FIRESTORE_EMULATOR_HOST to run the API end-to-end test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";

const { createApiAccount } = await import("../src/lib/api/accounts");
const { createApiKey, revokeApiKey } = await import("../src/lib/api/keys");
const { addCredits } = await import("../src/lib/api/credits");
const { openApiSpec } = await import("../src/lib/api/openapi");

const acct = await createApiAccount({ email: `e2e-${Date.now()}@example.com`, name: "E2E", beta: true });
const { key, keyId } = await createApiKey(acct, "e2e");
const auth = { authorization: `Bearer ${key}` };
const get = (path: string, headers: Record<string, string> = auth) => fetch(`${BASE}${path}`, { headers, redirect: "manual" });
const post = (path: string, body: unknown, headers: Record<string, string> = auth) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

// Site pages still render (no regression), the docs and the terms included.
for (const path of ["/", "/check", "/privacy", "/terms", "/legal", "/docs/api", "/docs/mcp", "/llms.txt", "/sitemap.xml", "/robots.txt"]) {
  const r = await get(path, {});
  assert.equal(r.status, 200, path);
}
const docs = (await (await get("/docs/api", {})).text()).replaceAll("<!-- -->", "");
for (const p of Object.keys(openApiSpec.paths)) assert.ok(docs.includes(`/v1${p}`), `docs list ${p}`);
assert.ok(docs.includes("/mcp"), "docs explain MCP");
assert.ok((await (await get("/terms", {})).text()).includes('id="api"'), "API terms section");
assert.ok([302, 307].includes((await get("/admin", {})).status), "admin still behind login");

// OpenAPI is served and matches the code.
let r = await get("/openapi.json", {});
assert.equal(r.status, 200);
assert.equal(r.headers.get("access-control-allow-origin"), "*");
assert.equal(((await r.json()) as { openapi: string }).openapi, "3.1.0");

// REST API through the /v1 rewrite.
r = await get("/v1/account", {});
assert.equal(r.status, 401);
assert.equal(await code(r), "missing_api_key");
r = await get("/v1/account", { authorization: "Bearer spz_live_wrong" });
assert.equal(await code(r), "invalid_api_key");
r = await get("/v1/nope");
assert.equal(r.status, 404);
assert.equal(await code(r), "not_found", "unknown paths answer JSON");
r = await get("/v1/account");
assert.equal(r.status, 200);
assert.equal(((await r.json()) as { balance: { cents: number } }).balance.cents, 0);
r = await post("/v1/checks", { url: "example.com" });
assert.equal(r.status, 402, "no credits: refused before any crawl");
await addCredits(acct, 500, "manual", "e2e");
r = await post("/v1/checks", { url: "localhost" });
assert.equal(await code(r), "invalid_url");
// 400 invalid_max_pages, or 503 when the server has no Cloud Tasks queue (local runs): never charged.
r = await post("/v1/reports", { url: "example.com", maxPages: 9999 });
assert.ok(["invalid_max_pages", "unavailable"].includes(await code(r)));
r = await get("/v1/ledger");
assert.equal(((await r.json()) as { data: { type: string }[] }).data[0].type, "credit");
r = await get("/v1/reports/nope");
assert.equal(r.status, 404);

// MCP server through the /mcp rewrite.
const mcp = (body: unknown, headers: Record<string, string> = auth) =>
  post("/mcp", body, { ...headers, accept: "application/json, text/event-stream" });
r = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {});
assert.equal(r.status, 401);
assert.ok(r.headers.get("www-authenticate"));
assert.equal((await get("/mcp")).status, 405);
assert.equal((await get("/mcp", { accept: "text/html" })).headers.get("location")?.endsWith("/docs/mcp"), true, "browsers land on the MCP docs");
r = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
assert.equal(((await r.json()) as { result: { protocolVersion: string } }).result.protocolVersion, "2025-06-18");
r = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_balance", arguments: {} } });
const bal = (await r.json()) as { result: { structuredContent: { balance: { cents: number } } } };
assert.equal(bal.result.structuredContent.balance.cents, 500);

// Revoking a key works at once on both.
await revokeApiKey(keyId);
assert.equal((await get("/v1/account")).status, 401);
assert.equal((await mcp({ jsonrpc: "2.0", id: 3, method: "ping" })).status, 401);

console.log("api e2e passed");
process.exit(0);
