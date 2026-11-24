import "server-only";
import { db } from "@/lib/firebase-admin";
import { createTask, deepTasksEnabled, signTask, verifySignedTask } from "@/lib/deep/tasks";
import { notifyAdmin } from "@/lib/notify";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import { accounts, type ApiAccount } from "./accounts";
import { addCredits } from "./credits";
import { sendLowBalance, sendTopUpDone, sendTopUpFailed } from "./emails";
import { getPack, packCreditCents } from "./packs";
import { purchaseDeps } from "./purchase";

// Automatic top-up: "buy pack X when the balance falls under Y". Runs after a charge leaves the
// balance under the threshold, through the task queue so the API call that triggered it isn't
// slowed down. At most MAX_PER_DAY top-ups per account and UTC day; a failed payment turns the
// feature off (no retry loop on a declined card) and emails the customer.

export const MAX_TOP_UPS_PER_DAY = 2;
/** Without automatic top-up, we email once when the balance falls under this. */
export const LOW_BALANCE_ALERT_CENTS = () => Number(process.env.API_LOW_BALANCE_ALERT_CENTS ?? 1200);
const IN_FLIGHT_MS = 3 * 60_000;
const utcDay = () => new Date().toISOString().slice(0, 10);

const scope = (accountId: string) => `topup:${accountId}`;
export const verifyTopUpTask = (accountId: string, token: string | null) => verifySignedTask(scope(accountId), token);

/**
 * Called after every successful charge. Cheap when nothing is needed. Never throws: a top-up
 * problem must not fail the API call that paid.
 */
export async function afterCharge(accountId: string, balanceBefore: number, balanceAfter: number): Promise<void> {
  try {
    const snap = await accounts().doc(accountId).get();
    const a = snap.data() as ApiAccount | undefined;
    if (!a) return;
    const auto = a.autoTopUp;
    if (auto?.enabled && a.paymentMethod && balanceAfter < auto.thresholdCents) {
      await scheduleTopUp(accountId);
      return;
    }
    // No automatic top-up: one email when the balance crosses under the alert level.
    const alertAt = LOW_BALANCE_ALERT_CENTS();
    if (!auto?.enabled && balanceBefore >= alertAt && balanceAfter < alertAt && !a.lowBalanceAlertedAt) {
      await accounts().doc(accountId).update({ lowBalanceAlertedAt: Date.now() });
      await sendLowBalance(a.email, balanceAfter);
    }
  } catch (err) {
    console.error("afterCharge failed", accountId, err instanceof Error ? err.message : err);
  }
}

async function scheduleTopUp(accountId: string): Promise<void> {
  if (deepTasksEnabled()) {
    const minute = Math.floor(Date.now() / 60_000);
    const ok = await createTask(`topup-${accountId}-${minute}`, `/api/internal/topup/${accountId}`, signTask(scope(accountId)), Date.now(), accountId);
    if (ok) return;
  }
  await runTopUp(accountId); // no queue: do it now
}

type Claim =
  | { ok: true; account: ApiAccount; count: number }
  | { ok: false; reason: "disabled" | "no_card" | "above_threshold" | "daily_limit" | "in_progress" | "missing" };

/** Reserves one top-up slot for today, or says why not. */
async function claim(accountId: string): Promise<Claim> {
  const ref = accounts().doc(accountId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const a = snap.data() as ApiAccount | undefined;
    if (!a) return { ok: false, reason: "missing" } as const;
    if (!a.autoTopUp?.enabled || a.status !== "active") return { ok: false, reason: "disabled" } as const;
    if (!a.paymentMethod || !a.stripeCustomerId) return { ok: false, reason: "no_card" } as const;
    if (a.balanceCents >= a.autoTopUp.thresholdCents) return { ok: false, reason: "above_threshold" } as const;
    const day = utcDay();
    const state = a.topUpState?.day === day ? a.topUpState : { day, count: 0, inFlightUntil: 0 };
    if (state.inFlightUntil > Date.now()) return { ok: false, reason: "in_progress" } as const;
    if (state.count >= MAX_TOP_UPS_PER_DAY) return { ok: false, reason: "daily_limit" } as const;
    const count = state.count + 1;
    tx.update(ref, { topUpState: { day, count, inFlightUntil: Date.now() + IN_FLIGHT_MS, lastError: a.topUpState?.lastError ?? null } });
    return { ok: true, account: a, count } as const;
  });
}

/**
 * Charges the saved card for the chosen pack and credits the account. Returns what happened.
 * The Stripe idempotency key is per account, day and slot, so a retried task never charges twice.
 */
export async function runTopUp(accountId: string): Promise<string> {
  const c = await claim(accountId);
  if (!c.ok) return c.reason;
  const { account: a, count } = c;
  const ref = accounts().doc(accountId);
  const pack = getPack(a.autoTopUp!.packId) ?? getPack("starter")!;
  const credit = packCreditCents(pack);
  const day = utcDay();
  try {
    const pi = await purchaseDeps.stripe().paymentIntents.create(
      {
        amount: pack.priceCents,
        currency: "usd",
        customer: a.stripeCustomerId!,
        payment_method: a.paymentMethod!.id,
        off_session: true,
        confirm: true,
        description: `Spamlyze API credits — ${pack.label} (automatic top-up)`,
        metadata: { kind: "api_topup", accountId, packId: pack.id, creditCents: String(credit) },
      },
      { idempotencyKey: `topup_${accountId}_${day}_${count}` },
    );
    if (pi.status === "processing") {
      // Rare for cards: Stripe confirms later, the payment_intent.succeeded webhook credits it.
      await ref.update({ "topUpState.inFlightUntil": 0 });
      return "processing";
    }
    if (pi.status !== "succeeded") throw new Error(`payment ${pi.status.replace(/_/g, " ")}`);
    const res = await addCredits(accountId, credit, "auto_top_up", `topup_${pi.id}`, `${pack.label} pack (automatic)`);
    await ref.update({ "topUpState.inFlightUntil": 0, "topUpState.lastError": null, lowBalanceAlertedAt: null });
    if (!res.replayed) {
      await Promise.all([
        track({ apiCreditsPurchasedCents: credit, revenueCents: pack.priceCents }),
        sendTopUpDone(a.email, credit, res.balanceCents, a.paymentMethod!.last4),
      ]);
    }
    return "topped_up";
  } catch (err) {
    const reason = stripeReason(err);
    await ref.update({
      "autoTopUp.enabled": false,
      "topUpState.inFlightUntil": 0,
      "topUpState.lastError": reason,
    });
    await Promise.all([
      sendTopUpFailed(a.email, reason),
      notifyAdmin("deep", `API auto top-up failed: ${a.name}`, [`Account: ${a.name} (${accountId})`, `Reason: ${reason}`], `${site.url}/admin/api`),
    ]);
    return "failed";
  }
}

function stripeReason(err: unknown): string {
  const e = err as { code?: string; decline_code?: string; message?: string };
  if (e.code === "authentication_required") return "your bank asked for a confirmation we can't do automatically.";
  if (e.decline_code === "insufficient_funds") return "insufficient funds.";
  if (e.code === "card_declined" || e.code === "expired_card") return "the card was declined.";
  return (e.message ?? "payment failed").slice(0, 160);
}

/** Webhook backup (payment_intent.succeeded): credits a top-up that finished after we returned. */
export async function fulfillTopUpIntent(pi: { id: string; status: string; metadata?: Record<string, string> | null }): Promise<void> {
  if (pi.metadata?.kind !== "api_topup" || pi.status !== "succeeded") return;
  const accountId = pi.metadata.accountId;
  const pack = getPack(pi.metadata.packId);
  if (!accountId || !pack) return;
  const credit = Number(pi.metadata.creditCents) || packCreditCents(pack);
  const res = await addCredits(accountId, credit, "auto_top_up", `topup_${pi.id}`, `${pack.label} pack (automatic)`);
  if (!res.replayed) await track({ apiCreditsPurchasedCents: credit, revenueCents: pack.priceCents });
}
