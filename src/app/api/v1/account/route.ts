import { accountSummary } from "@/lib/api/account-summary";
import { authenticate } from "@/lib/api/http";

/** GET /v1/account: who the key belongs to, the prepaid balance and the prices. */
export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  return Response.json(await accountSummary(ctx));
}
