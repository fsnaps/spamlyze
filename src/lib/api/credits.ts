import "server-only";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { accounts } from "./accounts";

// Prepaid credits. The balance lives on the account document and only changes inside a
// transaction that also writes a ledger entry, so the two can never disagree. Entry ids are
// derived from what they pay for (charge_<ref>, refund_<ref>, credit_<ref>): replaying the same
// operation finds the existing entry and changes nothing, so nothing is charged twice.

export type LedgerType = "credit" | "charge" | "refund";

export type LedgerEntry = {
  type: LedgerType;
  /** Signed: positive adds to the balance, negative takes from it. */
  cents: number;
  balanceAfter: number;
  /** "manual", "purchase", "quick_check", "deep_report", ... */
  reason: string;
  ref: string;
  note: string | null;
  createdAt: Timestamp;
};

export class CreditError extends Error {
  constructor(
    readonly code: "insufficient_credits" | "daily_cap_reached" | "account_not_found",
    message: string,
  ) {
    super(message);
  }
}

const ledger = (accountId: string) => accounts().doc(accountId).collection("ledger");
/** Spend per UTC day, used for the daily cap: apiAccounts/{id}/usage/{YYYY-MM-DD}. */
const usage = (accountId: string, day: string) => accounts().doc(accountId).collection("usage").doc(day);
const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const REF_RE = /^[A-Za-z0-9_-]{1,80}$/;

function checkRef(ref: string) {
  if (!REF_RE.test(ref)) throw new Error(`invalid ledger ref: ${ref}`);
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Result = { entryId: string; balanceCents: number; replayed: boolean };

async function readAccount(tx: Transaction, accountId: string) {
  const snap = await tx.get(accounts().doc(accountId));
  if (!snap.exists) throw new CreditError("account_not_found", "Account not found.");
  return snap;
}

/**
 * Takes `cents` from the balance to pay for `ref` (e.g. a check id). Fails without charging when
 * the balance is too low or the account's daily cap would be exceeded.
 */
export async function chargeCredits(accountId: string, cents: number, reason: string, ref: string): Promise<Result> {
  checkRef(ref);
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("charge must be a positive integer");
  const entryId = `charge_${ref}`;
  return db().runTransaction(async (tx) => {
    const day = utcDay();
    const [acct, existing, today] = await Promise.all([
      readAccount(tx, accountId),
      tx.get(ledger(accountId).doc(entryId)),
      tx.get(usage(accountId, day)),
    ]);
    const balance = (acct.get("balanceCents") as number) ?? 0;
    if (existing.exists) return { entryId, balanceCents: balance, replayed: true };

    if (balance < cents) {
      throw new CreditError(
        "insufficient_credits",
        `This costs ${usd(cents)} and your balance is ${usd(balance)}. Add credits at https://spamlyze.com/account.`,
      );
    }
    const cap = (acct.get("dailySpendCapCents") as number) ?? 0;
    const spent = (today.get("spentCents") as number) ?? 0;
    if (spent + cents > cap) {
      throw new CreditError(
        "daily_cap_reached",
        `Your daily spending cap of ${usd(cap)} is reached (${usd(spent)} spent today, UTC). It resets at midnight UTC.`,
      );
    }
    const after = balance - cents;
    tx.update(acct.ref, { balanceCents: after });
    tx.set(usage(accountId, day), { day, spentCents: FieldValue.increment(cents), count: FieldValue.increment(1) }, { merge: true });
    tx.create(ledger(accountId).doc(entryId), {
      type: "charge",
      cents: -cents,
      balanceAfter: after,
      reason,
      ref,
      note: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { entryId, balanceCents: after, replayed: false };
  });
}

/** Gives back a charge (failed analysis). Does nothing if there was no charge or it was already refunded. */
export async function refundCharge(accountId: string, ref: string, note?: string): Promise<Result | null> {
  checkRef(ref);
  const entryId = `refund_${ref}`;
  return db().runTransaction(async (tx) => {
    const [acct, charge, existing] = await Promise.all([
      readAccount(tx, accountId),
      tx.get(ledger(accountId).doc(`charge_${ref}`)),
      tx.get(ledger(accountId).doc(entryId)),
    ]);
    const balance = (acct.get("balanceCents") as number) ?? 0;
    if (!charge.exists) return null;
    if (existing.exists) return { entryId, balanceCents: balance, replayed: true };
    const cents = -(charge.get("cents") as number);
    const after = balance + cents;
    // The refund is taken off the day the charge was made, so a failure doesn't eat the cap.
    const chargedDay = utcDay((charge.get("createdAt") as Timestamp | undefined)?.toMillis());
    tx.update(acct.ref, { balanceCents: after });
    tx.set(usage(accountId, chargedDay), { spentCents: FieldValue.increment(-cents) }, { merge: true });
    tx.create(ledger(accountId).doc(entryId), {
      type: "refund",
      cents,
      balanceAfter: after,
      reason: charge.get("reason") as string,
      ref,
      note: note?.slice(0, 200) ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { entryId, balanceCents: after, replayed: false };
  });
}

/** Adds credits (manual top-up for the pilot, later Stripe purchases). Idempotent per ref. */
export async function addCredits(accountId: string, cents: number, reason: string, ref: string, note?: string): Promise<Result> {
  checkRef(ref);
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("credit must be a positive integer");
  const entryId = `credit_${ref}`;
  return db().runTransaction(async (tx) => {
    const [acct, existing] = await Promise.all([readAccount(tx, accountId), tx.get(ledger(accountId).doc(entryId))]);
    const balance = (acct.get("balanceCents") as number) ?? 0;
    if (existing.exists) return { entryId, balanceCents: balance, replayed: true };
    const after = balance + cents;
    tx.update(acct.ref, { balanceCents: after });
    tx.create(ledger(accountId).doc(entryId), {
      type: "credit",
      cents,
      balanceAfter: after,
      reason,
      ref,
      note: note?.slice(0, 200) ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { entryId, balanceCents: after, replayed: false };
  });
}

export async function spentToday(accountId: string): Promise<number> {
  const snap = await usage(accountId, utcDay()).get();
  return (snap.get("spentCents") as number) ?? 0;
}

export async function listLedger(accountId: string, limit = 50): Promise<(LedgerEntry & { id: string })[]> {
  const snap = await ledger(accountId).orderBy("createdAt", "desc").limit(Math.min(Math.max(limit, 1), 200)).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as LedgerEntry) }));
}
