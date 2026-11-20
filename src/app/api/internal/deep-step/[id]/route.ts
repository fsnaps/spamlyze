import { isDeepId, runStep } from "@/lib/deep/job";
import { enqueueDeepStep, verifyTaskToken } from "@/lib/deep/tasks";

/**
 * Called by Cloud Tasks: runs one step of a Deep Report and schedules the next one while the
 * report is running. A 2xx tells Cloud Tasks the task is done; failures inside a step are
 * handled by the job itself (retries, refund), so only unexpected errors return 500 to be retried.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/internal/deep-step/[id]">) {
  const { id } = await ctx.params;
  if (!isDeepId(id) || !verifyTaskToken(id, request.headers.get("x-spamlyze-task"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const report = await runStep(id);
    if (!report) return Response.json({ status: "missing" });
    if (report.status === "running") {
      // Another worker (the buyer's page) may hold the lease: then this step did nothing and
      // the next task simply tries again a bit later.
      await enqueueDeepStep(id, (report.leaseUntil ?? 0) > Date.now() ? 5_000 : 1_000);
    }
    return Response.json({ status: report.status, phase: report.phase });
  } catch (err) {
    console.error("deep task step failed", id, err instanceof Error ? err.message : err);
    return Response.json({ error: "step failed" }, { status: 500 });
  }
}
