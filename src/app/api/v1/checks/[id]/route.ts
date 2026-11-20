import { getApiCheck } from "@/lib/api/checks";
import { authenticate } from "@/lib/api/http";

/** GET /v1/checks/{id}: a Quick Check this account ran. Free. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/checks/[id]">) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  return getApiCheck(auth, id);
}
