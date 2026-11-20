import { authenticate } from "@/lib/api/http";
import { getApiReport } from "@/lib/api/reports";

/** GET /v1/reports/{id}: progress, then results. Add ?pages=true for the page-by-page verdicts. Free. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/reports/[id]">) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const withPages = new URL(request.url).searchParams.get("pages") === "true";
  return getApiReport(auth, id, withPages);
}
