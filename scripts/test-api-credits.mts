// Tests of API credits (ledger, refunds, daily cap) and the per-key rate limit, against the
// Firestore emulator. Run with the emulator up: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:api
import assert from "node:assert/strict";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the API credits test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";
process.env.API_KEY_PEPPER = "x".repeat(40);
process.env.API_ENABLED = "true";

const credits = await import("../src/lib/api/credits");
const { CreditError } = credits;
const { accounts, createApiAccount } = await import("../src/lib/api/accounts");
const { createApiKey } = await import("../src/lib/api/keys");
const { GET: accountRoute } = await import("../src/app/api/v1/account/route");
const { GET: ledgerRoute } = await import("../src/app/api/v1/ledger/route");

const acct = await createApiAccount({ email: "b@example.com", name: "B" });
await accounts().doc(acct).update({ dailySpendCapCents: 2500 });
const bal = async () => (await accounts().doc(acct).get()).get("balanceCents") as number;
const isCode = (code: string) => (e: unknown) => e instanceof CreditError && e.code === code;

// No credits: refused, nothing written.
await assert.rejects(credits.chargeCredits(acct, 15, "quick_check", "chk1"), isCode("insufficient_credits"));
assert.equal((await credits.listLedger(acct)).length, 0);
assert.equal(await bal(), 0);

// A top-up is idempotent per ref.
let res = await credits.addCredits(acct, 5000, "manual", "wire_1", "pilot");
assert.equal(res.balanceCents, 5000);
res = await credits.addCredits(acct, 5000, "manual", "wire_1", "pilot");
assert.equal(res.replayed, true);
assert.equal(await bal(), 5000);

// A charge is idempotent per ref.
res = await credits.chargeCredits(acct, 1200, "deep_report", "rep1");
assert.equal(res.balanceCents, 3800);
res = await credits.chargeCredits(acct, 1200, "deep_report", "rep1");
assert.equal(res.replayed, true);
assert.equal(await bal(), 3800);
assert.equal(await credits.spentToday(acct), 1200);

// Concurrent charges never overdraw or double count.
await accounts().doc(acct).update({ dailySpendCapCents: 100_000 });
const many = await Promise.allSettled(
  Array.from({ length: 10 }, (_, i) => credits.chargeCredits(acct, 500, "quick_check", `par${i}`)),
);
assert.equal(many.filter((m) => m.status === "fulfilled").length, 7, "3800 / 500 = 7 charges fit");
assert.equal(await bal(), 3800 - 7 * 500);
for (const m of many) if (m.status === "rejected") assert.ok(isCode("insufficient_credits")(m.reason));

// A refund gives back once, frees the daily cap, and ignores refs that were never charged.
const before = await bal();
const spentBefore = await credits.spentToday(acct);
res = (await credits.refundCharge(acct, "rep1", "crawl failed"))!;
assert.equal(res.balanceCents, before + 1200);
assert.equal((await credits.refundCharge(acct, "rep1"))!.replayed, true);
assert.equal(await bal(), before + 1200);
assert.equal(await credits.spentToday(acct), spentBefore - 1200);
assert.equal(await credits.refundCharge(acct, "never-charged"), null);

// Daily cap.
await credits.addCredits(acct, 10_000, "manual", "wire_2");
await accounts().doc(acct).update({ dailySpendCapCents: (await credits.spentToday(acct)) + 1000 });
await credits.chargeCredits(acct, 1000, "quick_check", "cap_ok");
await assert.rejects(credits.chargeCredits(acct, 15, "quick_check", "cap_no"), isCode("daily_cap_reached"));

// Bad input is refused before touching anything.
await assert.rejects(credits.chargeCredits(acct, -5, "quick_check", "neg"));
await assert.rejects(credits.chargeCredits(acct, 5, "quick_check", "bad/ref"));
await assert.rejects(credits.chargeCredits("acct_missing00", 5, "quick_check", "x"), isCode("account_not_found"));

// The ledger always adds up to the balance, newest first.
const entries = await credits.listLedger(acct, 200);
assert.equal(entries.reduce((s, e) => s + e.cents, 0), await bal());
assert.equal(entries.at(-1)?.balanceAfter, 5000);
for (let i = 1; i < entries.length; i++) assert.ok(entries[i].createdAt.toMillis() <= entries[i - 1].createdAt.toMillis());

// Over HTTP: ledger and account.
const { key } = await createApiKey(acct, "http");
const get = (path: string, k = key) =>
  new Request(`https://spamlyze.com/api/v1/${path}`, { headers: { authorization: `Bearer ${k}` } });
let r = await ledgerRoute(get("ledger?limit=3"));
assert.equal(r.status, 200);
const lj = (await r.json()) as { data: { type: string; cents: number }[] };
assert.equal(lj.data.length, 3);
r = await accountRoute(get("account"));
const aj = (await r.json()) as { balance: { cents: number }; spentToday: { cents: number } };
assert.equal(aj.balance.cents, await bal());
assert.equal(aj.spentToday.cents, await credits.spentToday(acct));

// Rate limit: over 3 requests in a minute (test setting) gets 429 with Retry-After.
process.env.API_RATE_PER_MINUTE = "3";
const { key: burstKey } = await createApiKey(acct, "burst");
const statuses: number[] = [];
for (let i = 0; i < 8 && !statuses.includes(429); i++) statuses.push((await accountRoute(get("account", burstKey))).status);
assert.ok(statuses.includes(429), `statuses: ${statuses}`);
r = await accountRoute(get("account", burstKey));
assert.equal(r.status, 429);
assert.ok(Number(r.headers.get("retry-after")) >= 1);
assert.equal(((await r.json()) as { error: { code: string } }).error.code, "rate_limited");
// Another key of the same account is not affected.
assert.equal((await accountRoute(get("account"))).status, 200);

console.log("api credits tests passed");
process.exit(0);
