import { accounts } from "@/lib/api/accounts";
import { apiError, authenticate } from "@/lib/api/http";
import { listWebhookEvents, removeWebhook, setWebhook, validateWebhookUrl, WebhookUrlError } from "@/lib/api/webhooks";

const EVENTS = ["report.done", "report.failed"];

/** GET /v1/webhook: the webhook URL, its signing secret and the latest deliveries. */
export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const doc = await accounts().doc(ctx.accountId).get();
  return Response.json({
    object: "webhook",
    url: doc.get("webhookUrl") ?? null,
    secret: doc.get("webhookSecret") ?? null,
    events: EVENTS,
    recentDeliveries: await listWebhookEvents(ctx.accountId),
  });
}

/** PUT /v1/webhook {"url": "https://…"}: sets where report.done and report.failed are sent. */
export async function PUT(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  if (!body || typeof body !== "object") return apiError(400, "invalid_body", 'Send a JSON body: {"url": "https://example.com/hooks/spamlyze"}');
  try {
    const url = await validateWebhookUrl(body.url);
    return Response.json({ object: "webhook", ...(await setWebhook(ctx.accountId, url)), events: EVENTS });
  } catch (err) {
    if (err instanceof WebhookUrlError) return apiError(400, "invalid_webhook_url", err.message);
    throw err;
  }
}

/** DELETE /v1/webhook: stops sending events (and forgets the signing secret). */
export async function DELETE(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  await removeWebhook(ctx.accountId);
  return Response.json({ object: "webhook", url: null, deleted: true });
}
