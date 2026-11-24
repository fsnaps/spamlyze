import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { DEFAULT_DAILY_SPEND_CAP_CENTS } from "./config";

export type ApiAccount = {
  email: string;
  name: string;
  createdAt: Timestamp;
  /** "suspended" blocks every key of the account. */
  status: "active" | "suspended";
  /** May use the API before it opens to everyone (API_ENABLED). */
  beta: boolean;
  /** Prepaid balance in US cents. Only changed by the credits ledger. */
  balanceCents: number;
  dailySpendCapCents: number;
  /** Where report.done / report.failed events are POSTed (set with PUT /v1/webhook). */
  webhookUrl?: string;
  /** Signs webhook payloads (HMAC-SHA256). Shown to the account, so it is stored as is. */
  webhookSecret?: string;
  /** Stripe customer, created at the first credit purchase. */
  stripeCustomerId?: string;
  /** Card saved at a credit purchase, used for automatic top-ups (off-session). */
  paymentMethod?: { id: string; brand: string; last4: string };
  /** "Buy `packId` when the balance falls under `thresholdCents`". */
  autoTopUp?: { enabled: boolean; thresholdCents: number; packId: string };
  /** Top-ups done today (max 2), the one in progress, and the last failure. */
  topUpState?: { day: string; count: number; inFlightUntil: number; lastError?: string | null };
  /** Low balance alert already sent while under this threshold (reset when credits are added). */
  lowBalanceAlertedAt?: number | null;
};

export const accounts = () => db().collection("apiAccounts");

export async function createApiAccount(input: { email: string; name: string; beta?: boolean }): Promise<string> {
  const id = `acct_${randomBytes(9).toString("base64url")}`;
  await accounts()
    .doc(id)
    .create({
      email: input.email.trim().toLowerCase(),
      name: input.name.trim().slice(0, 80),
      createdAt: FieldValue.serverTimestamp(),
      status: "active",
      beta: input.beta ?? false,
      balanceCents: 0,
      dailySpendCapCents: DEFAULT_DAILY_SPEND_CAP_CENTS,
    });
  return id;
}

export async function getApiAccount(id: string): Promise<ApiAccount | null> {
  if (!/^acct_[A-Za-z0-9_-]{8,20}$/.test(id)) return null;
  const snap = await accounts().doc(id).get();
  return snap.exists ? (snap.data() as ApiAccount) : null;
}
