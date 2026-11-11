import { AnalysisError } from "@/lib/check/analyze";
import { CrawlError } from "@/lib/check/crawl";
import { clientIp, GuardError, verifyCaptcha } from "@/lib/check/guard";
import { runQuickCheck } from "@/lib/check/run";
import { FetchBlockedError, normalizeInputUrl } from "@/lib/check/safe-fetch";
import { track } from "@/lib/stats";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown; token?: unknown } | null;
  const ip = clientIp(request.headers);

  try {
    const url = normalizeInputUrl(typeof body?.url === "string" ? body.url : "");
    await verifyCaptcha(typeof body?.token === "string" ? body.token : undefined, ip);
    const id = await runQuickCheck(url, ip);
    return Response.json({ id });
  } catch (err) {
    if (
      err instanceof GuardError ||
      err instanceof FetchBlockedError ||
      err instanceof CrawlError ||
      err instanceof AnalysisError
    ) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    console.error("quick check failed", err);
    await track({ quickCheckErrors: 1 });
    return Response.json({ error: "Something went wrong on our side. Please try again later." }, { status: 500 });
  }
}
