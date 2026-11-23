import "server-only";
import { addCredits } from "./credits";
import { getPack, packCreditCents, type CreditPack } from "./packs";
import { accounts } from "./accounts";
import { stripe } from "@/lib/stripe";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import { notifyAdmin } from "@/lib/notify";

// Buying prepaid API credits. A Stripe Checkout session is created per account; the credits are
// added when payment is confirmed (by the webhook, with the success redirect as a backup).
// addCredits is idempotent on the ref, so the two paths can never double-credit.

/** Swappable in tests (fake Stripe). */
export const purchaseDeps = { stripe };

export async function createCreditCheckout(accountId: string, accountEmail: string, pack: CreditPack): Promise<string> {
  const total = packCreditCents(pack);
  const bonus = pack.bonusCents ? ` + $${(pack.bonusCents / 100).toFixed(0)} bonus` : "";
  const session = await purchaseDeps.stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: accountEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          product_data: {
            name: `Spamlyze API credits — ${pack.label}`,
            description: `$${(total / 100).toFixed(0)} of API credits ($${(pack.priceCents / 100).toFixed(0)}${bonus}).`,
          },
        },
      },
    ],
    metadata: { kind: "api_credits", accountId, packId: pack.id, creditCents: String(total) },
    payment_intent_data: { metadata: { kind: "api_credits", accountId, packId: pack.id } },
    success_url: `${site.url}/account?purchase={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site.url}/account?purchase=canceled`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/**
 * Adds the bought credits to the account. Called from the Stripe webhook (and the redirect).
 * Idempotent: the ledger ref is the Stripe session id, so replays change nothing.
 */
export async function fulfillCreditPurchase(session: {
  id: string;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
}): Promise<{ handled: boolean; newlyCredited: boolean; cents: number }> {
  const none = { handled: false, newlyCredited: false, cents: 0 };
  if (session.metadata?.kind !== "api_credits" || session.payment_status !== "paid") return none;
  const accountId = session.metadata.accountId;
  const pack = getPack(session.metadata.packId);
  if (!accountId || !pack) return none;
  const cents = Number(session.metadata.creditCents) || packCreditCents(pack);
  const ref = `stripe_${session.id}`;
  const res = await addCredits(accountId, cents, "purchase", ref, `${pack.label} pack`);
  if (!res.replayed) {
    const name = (await accounts().doc(accountId).get()).get("name") ?? accountId;
    await Promise.all([
      track({ apiCreditsPurchasedCents: cents, revenueCents: pack.priceCents }),
      notifyAdmin(
        "deep",
        `API credits bought: ${name} · $${(pack.priceCents / 100).toFixed(2)}`,
        [`Account: ${name} (${accountId})`, `Pack: ${pack.label}`, `Credited: $${(cents / 100).toFixed(2)}`],
        `${site.url}/admin/api`,
      ),
    ]);
  }
  return { handled: true, newlyCredited: !res.replayed, cents };
}

/**
 * Backup for the webhook: when the buyer lands back on /account with a session id, we fetch the
 * session and credit the account. Idempotent with the webhook. Only credits a session that
 * belongs to this account. Returns the freshly credited amount, or null (already credited, or
 * not this account's session).
 */
export async function fulfillFromRedirect(accountId: string, sessionId: unknown): Promise<number | null> {
  if (typeof sessionId !== "string" || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  try {
    const session = await purchaseDeps.stripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.accountId !== accountId) return null;
    const res = await fulfillCreditPurchase({ id: session.id, payment_status: session.payment_status, metadata: session.metadata });
    return res.newlyCredited ? res.cents : null;
  } catch (err) {
    console.error("credit redirect fulfill failed", err instanceof Error ? err.message : err);
    return null;
  }
}
