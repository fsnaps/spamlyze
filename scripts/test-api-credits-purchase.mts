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

// Fake Stripe: records created Checkout sessions and lets us "pay" and retrieve them.
type Session = { id: string; url: string; payment_status: string; metadata: Record<string, string>; customer_email?: string };
const sessions = new Map<string, Session>();
let n = 0;
const fakeStripe = {
  checkout: {
    sessions: {
      create: async (args: { metadata: Record<string, string>; customer_email?: string }) => {
        const id = `cs_test_${++n}`;
        const s: Session = { id, url: `https://stripe.test/pay/${id}`, payment_status: "unpaid", metadata: args.metadata, customer_email: args.customer_email };
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
};
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
assert.equal(sessions.get(sid)!.customer_email, "buyer@example.com");
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

console.log("api credit purchase tests passed");
process.exit(0);
