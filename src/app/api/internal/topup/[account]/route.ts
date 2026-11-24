import { runTopUp, verifyTopUpTask } from "@/lib/api/topup";

/** Called by Cloud Tasks: one automatic top-up attempt for an account. */
export async function POST(request: Request, ctx: RouteContext<"/api/internal/topup/[account]">) {
  const { account } = await ctx.params;
  if (!/^acct_[A-Za-z0-9_-]{8,20}$/.test(account) || !verifyTopUpTask(account, request.headers.get("x-spamlyze-task"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    return Response.json({ status: await runTopUp(account) });
  } catch (err) {
    console.error("top-up failed", account, err instanceof Error ? err.message : err);
    return Response.json({ error: "top-up failed" }, { status: 500 });
  }
}
