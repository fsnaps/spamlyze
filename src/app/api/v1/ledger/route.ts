import { listLedger } from "@/lib/api/credits";
import { authenticate } from "@/lib/api/http";

/** GET /v1/ledger?limit=50: the account's credit movements, newest first. */
export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50) || 50;
  const entries = await listLedger(ctx.accountId, limit);
  return Response.json({
    data: entries.map((e) => ({
      id: e.id,
      type: e.type,
      cents: e.cents,
      balanceAfter: e.balanceAfter,
      reason: e.reason,
      ref: e.ref,
      note: e.note,
      createdAt: e.createdAt?.toDate().toISOString() ?? null,
    })),
  });
}
