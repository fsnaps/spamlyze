// Tests of the public API (keys, authentication) against the Firestore emulator. Run:
//   npx firebase-tools emulators:start --only firestore --project demo-spamlyze
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:api
import assert from "node:assert/strict";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the API test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";
process.env.API_KEY_PEPPER = "x".repeat(40);

const { generateKey, hashKey, createApiKey, findApiKey, revokeApiKey, listApiKeys } = await import("../src/lib/api/keys");
const { createApiAccount } = await import("../src/lib/api/accounts");
const { accounts } = await import("../src/lib/api/accounts");
const { GET: account } = await import("../src/app/api/v1/account/route");
const { db } = await import("../src/lib/firebase-admin");

// Key format and hashing
const k1 = generateKey();
assert.match(k1, /^spz_live_[0-9A-Za-z]{32}$/);
assert.notEqual(generateKey(), k1);
assert.equal(hashKey(k1), hashKey(k1));
assert.equal(hashKey(k1).length, 64);
const h1 = hashKey(k1);
process.env.API_KEY_PEPPER = "y".repeat(40);
assert.notEqual(hashKey(k1), h1, "the hash depends on the pepper");
process.env.API_KEY_PEPPER = "x".repeat(40);

const req = (key?: string, header: "auth" | "x" = "auth") =>
  new Request("https://spamlyze.com/api/v1/account", {
    headers: key ? (header === "auth" ? { authorization: `Bearer ${key}` } : { "x-api-key": key }) : {},
  });
const body = async (r: Response) => (await r.json()) as { error?: { code: string } } & Record<string, unknown>;

// An account with a key; nothing stores the key in clear.
const acct = await createApiAccount({ email: "Agency@Example.com ", name: "Agency", beta: false });
const { key, keyId, hint } = await createApiKey(acct, "CI");
assert.equal(keyId, hashKey(key));
assert.ok(hint.startsWith("spz_live_") && hint.includes("…") && !hint.includes(key.slice(13, 28)));
const stored = JSON.stringify((await db().collection("apiKeys").doc(keyId).get()).data());
assert.ok(!stored.includes(key), "the key must not be stored in clear");
assert.ok(await findApiKey(key));
assert.equal(await findApiKey("spz_live_" + "A".repeat(32)), null);
assert.equal(await findApiKey("not a key"), null);

// Missing / malformed / unknown keys: 401, same code for unknown and revoked.
let r = await account(req());
assert.equal(r.status, 401);
assert.equal((await body(r)).error?.code, "missing_api_key");
r = await account(req("spz_live_" + "B".repeat(32)));
assert.equal(r.status, 401);
assert.equal((await body(r)).error?.code, "invalid_api_key");

// API closed (API_ENABLED unset) and account not in beta: 503.
delete process.env.API_ENABLED;
r = await account(req(key));
assert.equal(r.status, 503);
assert.equal((await body(r)).error?.code, "api_not_open");

// Beta accounts can use it before launch, with either header.
await accounts().doc(acct).update({ beta: true });
for (const h of ["auth", "x"] as const) {
  r = await account(req(key, h));
  assert.equal(r.status, 200, h);
}
const me = await body(r);
assert.equal(me.id, acct);
assert.equal(me.email, "agency@example.com");
assert.deepEqual(me.balance, { cents: 0, currency: "usd" });
assert.deepEqual((me.prices as Record<string, unknown>).deepReport, { cents: 1200, currency: "usd" });
assert.equal(JSON.stringify(me).includes(key), false);

// Once open, any active account works; lastUsed is recorded.
await accounts().doc(acct).update({ beta: false });
process.env.API_ENABLED = "true";
r = await account(req(key));
assert.equal(r.status, 200);
const used = (await db().collection("apiKeys").doc(keyId).get()).data();
assert.ok(used?.lastUsedAt, "lastUsedAt recorded");

// Suspended account: 403.
await accounts().doc(acct).update({ status: "suspended" });
r = await account(req(key));
assert.equal(r.status, 403);
await accounts().doc(acct).update({ status: "active" });

// Revocation is immediate and idempotent.
assert.equal(await revokeApiKey(keyId), true);
assert.equal(await revokeApiKey(keyId), false);
r = await account(req(key));
assert.equal(r.status, 401);
assert.equal((await body(r)).error?.code, "invalid_api_key");
assert.equal((await listApiKeys(acct)).length, 1);

// Missing pepper in production fails closed with 503, not a 500 or an open door.
const { key: key2 } = await createApiKey(acct, "Second");
delete process.env.API_KEY_PEPPER;
(process.env as Record<string, string>).NODE_ENV = "production";
r = await account(req(key2));
assert.equal(r.status, 503);
assert.equal((await body(r)).error?.code, "unavailable");

console.log("api tests passed");
process.exit(0);
