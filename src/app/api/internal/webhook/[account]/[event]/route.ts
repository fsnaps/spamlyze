import { verifySignedTask } from "@/lib/deep/tasks";
import { webhookTaskScope } from "@/lib/api/webhook-events";
import { deliverWebhook } from "@/lib/api/webhooks";

/**
 * Called by Cloud Tasks: one delivery attempt of a webhook event. Retries are scheduled by
 * deliverWebhook itself (with backoff), so this answers 200 unless something unexpected broke.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/internal/webhook/[account]/[event]">) {
  const { account, event } = await ctx.params;
  const valid =
    /^acct_[A-Za-z0-9_-]{8,20}$/.test(account) &&
    /^evt_[A-Za-z0-9_-]{10,60}$/.test(event) &&
    verifySignedTask(webhookTaskScope(account, event), request.headers.get("x-spamlyze-task"));
  if (!valid) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json({ status: await deliverWebhook(account, event) });
  } catch (err) {
    console.error("webhook delivery failed", event, err instanceof Error ? err.message : err);
    return Response.json({ error: "delivery failed" }, { status: 500 });
  }
}
