import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDeepReport } from "@/lib/deep/job";
import { assertPublicHost, FetchBlockedError, normalizeInputUrl, safePost } from "@/lib/check/safe-fetch";
import { accounts } from "./accounts";
import { serializeReport } from "./reports";
import { scheduleWebhook, webhookEvents, type WebhookEventDoc } from "./webhook-events";

// Webhooks: when an API Deep Report ends, we POST the report to the account's URL, signed like
// Stripe does: header `Spamlyze-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`.
// A non-2xx answer or a timeout is retried 6 times over about 9 hours, then given up.

/** Delay before each retry, after the first attempt. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

export function signPayload(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export class WebhookUrlError extends Error {}

/** Only public https URLs (http is allowed outside production, for local tests). */
export async function validateWebhookUrl(raw: unknown): Promise<URL> {
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw.trim())) {
    throw new WebhookUrlError("Send a full URL starting with https://");
  }
  let url: URL;
  try {
    url = normalizeInputUrl(raw);
  } catch (err) {
    throw new WebhookUrlError(err instanceof Error ? err.message : "Invalid URL.");
  }
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new WebhookUrlError("The webhook URL must use https.");
  try {
    await assertPublicHost(url.hostname);
  } catch (err) {
    throw new WebhookUrlError(err instanceof FetchBlockedError ? err.message : "This host can't be reached.");
  }
  return url;
}

/** Sets the account's webhook URL. Keeps the signing secret if there is one, else creates it. */
export async function setWebhook(accountId: string, url: URL): Promise<{ url: string; secret: string }> {
  const ref = accounts().doc(accountId);
  const secret = ((await ref.get()).get("webhookSecret") as string | undefined) ?? newWebhookSecret();
  await ref.update({ webhookUrl: url.toString(), webhookSecret: secret });
  return { url: url.toString(), secret };
}

export async function removeWebhook(accountId: string): Promise<void> {
  await accounts().doc(accountId).update({ webhookUrl: FieldValue.delete(), webhookSecret: FieldValue.delete() });
}

/**
 * One delivery attempt. Schedules the next attempt on failure (unless retry is false).
 * Returns the event's status afterwards.
 */
export async function deliverWebhook(accountId: string, evtId: string, opts: { retry?: boolean } = {}): Promise<string> {
  const ref = webhookEvents(accountId).doc(evtId);
  const snap = await ref.get();
  const evt = snap.data() as WebhookEventDoc | undefined;
  if (!evt || evt.status !== "pending") return evt?.status ?? "missing";
  const [account, report] = await Promise.all([accounts().doc(accountId).get(), getDeepReport(evt.reportId)]);
  const secret = account.get("webhookSecret") as string | undefined;
  if (!secret || !report || report.accountId !== accountId) {
    await ref.update({ status: "failed", lastError: "webhook removed" });
    return "failed";
  }

  const body = JSON.stringify({
    id: evtId,
    object: "event",
    type: evt.type,
    createdAt: evt.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
    data: await serializeReport(evt.reportId, report, false),
  });
  const timestamp = Math.floor(Date.now() / 1000);
  let status: number | null = null;
  let error: string | null = null;
  try {
    status = await safePost(new URL(evt.url), body, {
      "spamlyze-signature": signPayload(secret, timestamp, body),
      "spamlyze-event": evt.type,
      "spamlyze-event-id": evtId,
    });
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 200) : "network error";
  }

  const attempts = evt.attempts + 1;
  if (!error) {
    await ref.update({ status: "delivered", attempts, lastStatus: status, lastError: null, deliveredAt: FieldValue.serverTimestamp() });
    return "delivered";
  }
  const giveUp = attempts >= MAX_ATTEMPTS || opts.retry === false;
  await ref.update({ status: giveUp ? "failed" : "pending", attempts, lastStatus: status, lastError: error });
  if (!giveUp && !(await scheduleWebhook(accountId, evtId, attempts, RETRY_DELAYS_MS[attempts - 1]))) {
    await ref.update({ status: "failed" });
    return "failed";
  }
  return giveUp ? "failed" : "pending";
}

/** The account's latest webhook events, newest first (for GET /v1/webhook and the admin). */
export async function listWebhookEvents(accountId: string, limit = 10) {
  const snap = await webhookEvents(accountId).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const e = d.data() as WebhookEventDoc;
    return {
      id: d.id,
      type: e.type,
      reportId: e.reportId,
      status: e.status,
      attempts: e.attempts,
      lastStatus: e.lastStatus ?? null,
      lastError: e.lastError ?? null,
      createdAt: e.createdAt?.toDate().toISOString() ?? null,
    };
  });
}
