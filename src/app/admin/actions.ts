"use server";

import { redirect } from "next/navigation";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/admin/require";
import { botChallengeMessage, discoverSite, probeCrawlable } from "@/lib/check/crawl";
import { normalizeInputUrl } from "@/lib/check/safe-fetch";
import { getDeepReport, isDeepId, restartDeepReport, startTestDeepReport } from "@/lib/deep/job";
import { db } from "@/lib/firebase-admin";
import { today } from "@/lib/stats";

/** Test reports cost real Claude credits (about $0.65 to $3.35 each): capped per day, all admins together. */
const TESTS_PER_DAY = Number(process.env.ADMIN_DEEP_TESTS_PER_DAY ?? 5);

export type TestDeepState = { error: string | null };

export async function startTestDeepAction(_prev: TestDeepState, formData: FormData): Promise<TestDeepState> {
  const admin = await requireAdmin();
  let url: URL;
  try {
    url = normalizeInputUrl(String(formData.get("url") ?? ""));
    const site = await discoverSite(url);
    if (site.robotsBlocked) return { error: "This site blocks crawlers in its robots.txt." };
    if ((await probeCrawlable(site)).blocked) return { error: botChallengeMessage(url.hostname) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid URL." };
  }
  const maxPages = formData.get("size") === "500" ? 500 : 100;

  const counter = db().collection("rateLimits").doc(`admin_deep_tests_${today()}`);
  const allowed = await db().runTransaction(async (tx) => {
    const count = ((await tx.get(counter)).get("count") as number) ?? 0;
    if (count >= TESTS_PER_DAY) return false;
    tx.set(counter, { count: FieldValue.increment(1), expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86_400_000) }, { merge: true });
    return true;
  });
  if (!allowed) return { error: `Limit of ${TESTS_PER_DAY} test reports per day reached.` };

  const id = await startTestDeepReport(url, maxPages, admin);
  redirect(`/deep/${id}`);
}

export type RerunState = { error: string | null; done?: boolean };

/** Runs a report again (after a fix, or once the buyer has let SpamlyzeBot through their firewall). */
export async function rerunDeepAction(_prev: RerunState, formData: FormData): Promise<RerunState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!isDeepId(id)) return { error: "Unknown report." };
  const report = await getDeepReport(id);
  if (!report) return { error: "Unknown report." };
  if (report.status !== "done" && report.status !== "failed") return { error: `Report is ${report.status}.` };
  try {
    const site = await discoverSite(new URL(report.inputUrl));
    if (site.robotsBlocked) return { error: "robots.txt blocks crawlers." };
    const probe = await probeCrawlable(site);
    if (probe.blocked) return { error: `Still blocked: ${probe.challenged}/${probe.tried} test pages challenged.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Site unreachable." };
  }
  if (!(await restartDeepReport(id))) return { error: "Could not restart." };
  return { error: null, done: true };
}
