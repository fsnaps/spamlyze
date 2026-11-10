import { isDeepId, runStep } from "@/lib/deep/job";
import { publicStatus } from "@/lib/deep/status";

export async function POST(_request: Request, ctx: RouteContext<"/api/deep/[id]/step">) {
  const { id } = await ctx.params;
  if (!isDeepId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const report = await runStep(id);
  if (!report) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(publicStatus(report));
}
