import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { createTask, deepTasksEnabled, signTask } from "@/lib/deep/tasks";
import { accounts } from "./accounts";

// Recording and scheduling webhook events. Kept apart from the delivery code (webhooks.ts) so the
// Deep Report job can call it without importing the API report serializer (no import cycle).

export type WebhookEventType = "report.done" | "report.failed";

export type WebhookEventDoc = {
  type: WebhookEventType;
  reportId: string;
  url: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  createdAt: FirebaseFirestore.Timestamp;
  deliveredAt?: FirebaseFirestore.Timestamp;
  lastStatus?: number | null;
  lastError?: string | null;
};

export const webhookEvents = (accountId: string) => accounts().doc(accountId).collection("webhookEvents");

export const eventId = (reportId: string, type: WebhookEventType) => `evt_${reportId}_${type.split(".")[1]}`;

const taskScope = (accountId: string, evtId: string) => `webhook:${accountId}:${evtId}`;
export const webhookTaskToken = (accountId: string, evtId: string) => signTask(taskScope(accountId, evtId));
export { taskScope as webhookTaskScope };

/** Schedules one delivery attempt through Cloud Tasks. False when the queue is off or down. */
export async function scheduleWebhook(accountId: string, evtId: string, attempt: number, delayMs: number): Promise<boolean> {
  if (!deepTasksEnabled()) return false;
  let token: string;
  try {
    token = webhookTaskToken(accountId, evtId);
  } catch {
    return false;
  }
  return createTask(`wh-${evtId}-${attempt}`, `/api/internal/webhook/${accountId}/${evtId}`, token, Date.now() + delayMs, evtId);
}

/**
 * Records that an API report ended and sends the webhook if the account has one. Each event is
 * recorded once (create fails on a second call), so a report never notifies twice. Never throws:
 * a webhook problem must not affect the report itself.
 */
export async function queueReportEvent(reportId: string, accountId: string, type: WebhookEventType): Promise<void> {
  try {
    const account = await accounts().doc(accountId).get();
    const url = account.get("webhookUrl") as string | undefined;
    if (!url) return;
    const evtId = eventId(reportId, type);
    try {
      await webhookEvents(accountId).doc(evtId).create({
        type,
        reportId,
        url,
        status: "pending",
        attempts: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 6) return; // ALREADY_EXISTS: already queued
      throw err;
    }
    if (!(await scheduleWebhook(accountId, evtId, 0, 0))) {
      // No queue: try once right away so the customer still hears about it.
      const { deliverWebhook } = await import("./webhooks");
      await deliverWebhook(accountId, evtId, { retry: false });
    }
  } catch (err) {
    console.error("webhook queue failed", reportId, err instanceof Error ? err.message : err);
  }
}
