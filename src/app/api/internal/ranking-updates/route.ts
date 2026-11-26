import { syncRankingUpdates, verifyRankingCron } from "@/lib/gsc/update-feed";

/**
 * Called once a day by Cloud Scheduler (header x-spamlyze-cron, shown on /admin): pulls Google's
 * ranking updates from the Search Status Dashboard into Firestore.
 */
export async function POST(request: Request) {
  if (!verifyRankingCron(request.headers.get("x-spamlyze-cron"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const result = await syncRankingUpdates();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
