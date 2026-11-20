import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { analyze, type Analysis } from "./analyze";
import { crawl } from "./crawl";
import { computeMetrics, type Metrics } from "./metrics";
import { cachedCheck, takeQuota } from "./guard";
import { notifyAdmin } from "@/lib/notify";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";

export type StoredCheck = {
  domain: string;
  url: string;
  createdAt: FirebaseFirestore.Timestamp;
  pagesAnalyzed: number;
  robotsBlocked: boolean;
  metrics: Metrics;
  analysis: Analysis | null;
  model: string;
  source?: "site" | "api";
  accountId?: string;
};

export const domainOf = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");

/** Runs (or reuses) a quick check for the free site and returns its id. Throws user-facing errors. */
export async function runQuickCheck(url: URL, ip: string): Promise<string> {
  const cached = await cachedCheck(domainOf(url));
  if (cached) {
    await track({ quickChecksCached: 1 });
    return cached;
  }
  await takeQuota(ip);
  return executeQuickCheck(url);
}

/**
 * Crawls, analyzes and stores a new quick check, without any quota or cache check (the caller
 * decides). `api` marks checks paid for through the public API.
 */
export async function executeQuickCheck(url: URL, api?: { accountId: string }): Promise<string> {
  const domain = domainOf(url);
  const result = await crawl(url);
  const metrics = computeMetrics(result);
  const ai = result.robotsBlocked ? null : await analyze(result, metrics);

  const id = randomBytes(9).toString("base64url");
  await db()
    .collection("checks")
    .doc(id)
    .set({
      domain,
      url: result.origin,
      createdAt: FieldValue.serverTimestamp(),
      pagesAnalyzed: metrics.pagesAnalyzed,
      robotsBlocked: result.robotsBlocked,
      metrics,
      analysis: ai?.analysis ?? null,
      model: ai?.model ?? "",
      usage: ai?.usage ?? null,
      source: api ? "api" : "site",
      ...(api ? { accountId: api.accountId } : {}),
    });
  await db().collection("checkCache").doc(domain).set({ checkId: id, createdAt: FieldValue.serverTimestamp() });

  const opus = ai?.model.includes("opus");
  await Promise.all([
    track({
      [api ? "apiQuickChecks" : "quickChecks"]: 1,
      [opus ? "opusInputTokens" : "haikuInputTokens"]: ai?.usage.input ?? 0,
      [opus ? "opusOutputTokens" : "haikuOutputTokens"]: ai?.usage.output ?? 0,
    }),
    notifyAdmin(
      "quick_check",
      `${api ? "API " : ""}Quick Check: ${domain}${ai ? ` · ${ai.analysis.riskScore}/100` : ""}`,
      [
        `Site: ${result.origin}`,
        ai ? `Risk: ${ai.analysis.riskScore}/100 (${ai.analysis.riskLevel})` : "Blocked by robots.txt",
        `Pages sampled: ${metrics.pagesAnalyzed}`,
        ...(api ? [`API account: ${api.accountId}`] : []),
      ],
      `${site.url}/report/${id}`,
    ),
  ]);
  return id;
}

export async function getCheck(id: string): Promise<StoredCheck | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null;
  const snap = await db().collection("checks").doc(id).get();
  return snap.exists ? (snap.data() as StoredCheck) : null;
}
