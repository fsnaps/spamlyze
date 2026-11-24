// Tests buying API credits (Stripe packs) against the Firestore emulator, with a fake Stripe.
// Run with the emulator up:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:api
import assert from "node:assert/strict";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("skipped: set FIRESTORE_EMULATOR_HOST to run the credit purchase test");
  process.exit(0);
}
process.env.GOOGLE_CLOUD_PROJECT ??= "demo-spamlyze";
await fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/databases/(default)/documents`,
  { method: "DELETE" },
);
process.env.API_KEY_PEPPER = "x".repeat(40);
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.BREVO_API_KEY = "test-brevo";

// Fake Stripe: Checkout sessions we can "pay", customers, and PaymentIntents for top-ups.
type Session = { id: string; url: string; payment_status: string; metadata: Record<string, string>; customer?: string; payment_intent?: string };
const sessions = new Map<string, Session>();
let n = 0;
let cardFails: null | { code: string; decline_code?: string } = null;
const charges: { amount: number; key: string; customer: string; payment_method: string }[] = [];
const intents = new Map<string, { id: string; status: string; customer: string; metadata: Record<string, string> }>();
const fakeStripe = {
  customers: {
    create: async () => ({ id: `cus_${++n}` }),
  },
  checkout: {
    sessions: {
      create: async (args: { metadata: Record<string, string>; customer?: string; payment_intent_data: { setup_future_usage?: string } }) => {
        assert.equal(args.payment_intent_data.setup_future_usage, "off_session", "the card is saved for top-ups");
        const id = `cs_test_${++n}`;
        const pi = `pi_checkout_${n}`;
        intents.set(pi, { id: pi, status: "succeeded", customer: args.customer!, metadata: {} });
        const s: Session = { id, url: `https://stripe.test/pay/${id}`, payment_status: "unpaid", metadata: args.metadata, customer: args.customer, payment_intent: pi };
        sessions.set(id, s);
        return s;
      },
      retrieve: async (id: string) => {
        const s = sessions.get(id);
        if (!s) throw new Error("no such session");
        return s;
      },
    },
  },
  paymentIntents: {
    retrieve: async (id: string) => ({ ...intents.get(id)!, payment_method: { id: "pm_card_1", card: { brand: "visa", last4: "4242" } } }),
    create: async (
      args: { amount: number; customer: string; payment_method: string; off_session: boolean; confirm: boolean; metadata: Record<string, string> },
      opts: { idempotencyKey: string },
    ) => {
      assert.equal(args.off_session, true);
      if (cardFails) throw Object.assign(new Error("Your card was declined."), cardFails);
      const prior = charges.find((c) => c.key === opts.idempotencyKey);
      if (prior) return intents.get(`pi_${prior.key}`)!;
      charges.push({ amount: args.amount, key: opts.idempotencyKey, customer: args.customer, payment_method: args.payment_method });
      const pi = { id: `pi_${opts.idempotencyKey}`, status: "succeeded", customer: args.customer, metadata: args.metadata };
      intents.set(pi.id, pi);
      return pi;
    },
  },
};
// Emails go to Brevo: recorded here instead.
const emails: { to: string; subject: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url === "https://api.brevo.com/v3/smtp/email") {
    const b = JSON.parse(String(init?.body)) as { to: { email: string }[]; subject: string };
    emails.push({ to: b.to[0].email, subject: b.subject });
    return Response.json({ messageId: "x" }, { status: 201 });
  }
  return realFetch(input, init);
}) as typeof fetch;
const { createApiAccount, accounts } = await import("../src/lib/api/accounts");
const { CREDIT_PACKS, packCreditCents } = await import("../src/lib/api/packs");
const purchase = await import("../src/lib/api/purchase");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
purchase.purchaseDeps.stripe = () => fakeStripe as any;
const { createCreditCheckout, fulfillCreditPurchase, fulfillFromRedirect } = purchase;
const { listLedger } = await import("../src/lib/api/credits");

const acct = await createApiAccount({ email: "buyer@example.com", name: "Buyer" });
const bal = async () => ((await accounts().doc(acct).get()).get("balanceCents") as number) ?? 0;
const pay = (id: string) => (sessions.get(id)!.payment_status = "paid");

// Pack maths: bonus is on top of what's paid.
const growth = CREDIT_PACKS.find((p) => p.id === "growth")!;
assert.equal(packCreditCents(growth), growth.priceCents + growth.bonusCents);

// A checkout is created with the account's metadata; nothing is credited before payment.
const url = await createCreditCheckout(acct, "buyer@example.com", growth);
assert.match(url, /^https:\/\/stripe\.test\/pay\/cs_test_/);
const sid = url.split("/").pop()!;
assert.match(sessions.get(sid)!.customer ?? "", /^cus_/);
assert.equal(await bal(), 0, "unpaid: no credits");
assert.equal((await fulfillCreditPurchase(sessions.get(sid)!)).handled, false, "unpaid is ignored");

// Once paid, the webhook credits price + bonus, once.
pay(sid);
assert.equal((await fulfillCreditPurchase(sessions.get(sid)!)).newlyCredited, true);
assert.equal(await bal(), packCreditCents(growth));
assert.equal((await fulfillCreditPurchase(sessions.get(sid)!)).newlyCredited, false, "replay is a no-op");
assert.equal(await bal(), packCreditCents(growth), "credited exactly once");

// The redirect backup credits the same session only once (idempotent with the webhook).
assert.equal(await fulfillFromRedirect(acct, sid), null, "already credited by the webhook");

// A fresh purchase credited only through the redirect path.
const url2 = await createCreditCheckout(acct, "buyer@example.com", CREDIT_PACKS[0]);
const sid2 = url2.split("/").pop()!;
pay(sid2);
const before = await bal();
assert.equal(await fulfillFromRedirect(acct, sid2), CREDIT_PACKS[0].priceCents);
assert.equal(await bal(), before + CREDIT_PACKS[0].priceCents);
assert.equal(await fulfillFromRedirect(acct, sid2), null, "second redirect is a no-op");

// A session belonging to another account is never credited here.
const other = await createApiAccount({ email: "x@example.com", name: "X" });
const url3 = await createCreditCheckout(other, "x@example.com", CREDIT_PACKS[0]);
const sid3 = url3.split("/").pop()!;
pay(sid3);
assert.equal(await fulfillFromRedirect(acct, sid3), null, "not my session");
assert.equal(await bal(), before + CREDIT_PACKS[0].priceCents, "unchanged");

// The ledger shows the purchases, each tied to its Stripe session.
const ledger = await listLedger(acct, 50);
const purchases = ledger.filter((e) => e.reason === "purchase");
assert.equal(purchases.length, 2);
assert.ok(purchases.every((e) => e.ref.startsWith("stripe_cs_test_")));
assert.equal(ledger.reduce((s, e) => s + e.cents, 0), await bal());


// ---- Saved card and automatic top-up ----
const { chargeCredits } = await import("../src/lib/api/credits");
const { MAX_TOP_UPS_PER_DAY } = await import("../src/lib/api/topup");
const a1 = (await accounts().doc(acct).get()).data()!;
assert.deepEqual(a1.paymentMethod, { id: "pm_card_1", brand: "visa", last4: "4242" }, "card saved at purchase");
assert.match(a1.stripeCustomerId, /^cus_/);

// Low balance email without auto top-up: once, when crossing under $12.
const lone = await createApiAccount({ email: "lone@example.com", name: "Lone" });
const { addCredits } = await import("../src/lib/api/credits");
await addCredits(lone, 2000, "manual", "lone1");
await chargeCredits(lone, 500, "quick_check", "lone_c1"); // 15.00 left, above $12
assert.equal(emails.filter((e) => e.to === "lone@example.com").length, 0);
await chargeCredits(lone, 500, "quick_check", "lone_c2"); // 10.00: crosses
await chargeCredits(lone, 500, "quick_check", "lone_c3"); // 5.00: already alerted
const loneMails = emails.filter((e) => e.to === "lone@example.com");
assert.equal(loneMails.length, 1, "one low-balance email");
assert.match(loneMails[0].subject, /balance is low/);

// Turn on: under $250, buy Growth ($200 paid, $220 credited). Queue is off here: runs inline.
await accounts().doc(acct).update({ autoTopUp: { enabled: true, thresholdCents: 25_000, packId: "growth" }, dailySpendCapCents: 1_000_000 });
const b0 = await bal();
await chargeCredits(acct, 100, "quick_check", "tu_c1"); // still above 250? b0 = 270 + 50 ... see below
const afterFirst = await bal();
if (b0 - 100 < 25_000) {
  assert.equal(charges.length, 1, "top-up charged");
  assert.equal(charges[0].amount, 20_000);
  assert.equal(charges[0].payment_method, "pm_card_1");
  assert.equal(afterFirst, b0 - 100 + 22_000);
} else {
  assert.equal(charges.length, 0);
}
// Drain under the threshold until the daily limit stops top-ups.
let guard = 0;
while (charges.length < MAX_TOP_UPS_PER_DAY && guard++ < 20) {
  const b = await bal();
  await chargeCredits(acct, Math.max(100, b - 24_000), "deep_report", `tu_drain_${guard}`);
}
assert.equal(charges.length, MAX_TOP_UPS_PER_DAY);
await chargeCredits(acct, Math.max(100, (await bal()) - 24_000), "deep_report", "tu_over");
assert.equal(charges.length, MAX_TOP_UPS_PER_DAY, "no third top-up today");
assert.equal(new Set(charges.map((c) => c.key)).size, charges.length, "one idempotency key per top-up");
const doneMails = emails.filter((e) => e.to === "buyer@example.com" && /added automatically/.test(e.subject));
assert.equal(doneMails.length, MAX_TOP_UPS_PER_DAY);

// A declined card: top-up turns itself off, the customer is told, no credit.
const card = await createApiAccount({ email: "declined@example.com", name: "Declined" });
await addCredits(card, 3000, "manual", "dc1");
await accounts().doc(card).update({
  stripeCustomerId: "cus_x",
  paymentMethod: { id: "pm_x", brand: "visa", last4: "0002" },
  autoTopUp: { enabled: true, thresholdCents: 2_500, packId: "starter" },
});
cardFails = { code: "card_declined", decline_code: "insufficient_funds" };
await chargeCredits(card, 1000, "quick_check", "dc_c1");
const declined = (await accounts().doc(card).get()).data()!;
assert.equal(declined.autoTopUp.enabled, false, "turned off after a failure");
assert.equal(declined.topUpState.lastError, "insufficient funds.");
assert.equal(declined.balanceCents, 2000);
assert.ok(emails.some((e) => e.to === "declined@example.com" && /top-up failed/.test(e.subject)));
cardFails = null;
const chargesBefore = charges.length;
await chargeCredits(card, 100, "quick_check", "dc_c2");
assert.equal(charges.length, chargesBefore, "no retry on a declined card");

// The ledger still matches the balance with top-ups in it.
const ledger2 = await listLedger(acct, 100);
assert.equal(ledger2.reduce((s, e) => s + e.cents, 0), await bal());
assert.equal(ledger2.filter((e) => e.reason === "auto_top_up").length, MAX_TOP_UPS_PER_DAY);

console.log("api credit purchase tests passed");
process.exit(0);
