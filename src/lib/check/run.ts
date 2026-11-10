import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { analyze, type Analysis } from "./analyze";
import { crawl } from "./crawl";
import { computeMetrics, type Metrics } from "./metrics";
import { cachedCheck, takeQuota } from "./guard";

export type StoredCheck = {
  domain: string;
  url: string;
  createdAt: FirebaseFirestore.Timestamp;
  pagesAnalyzed: number;
  robotsBlocked: boolean;
  metrics: Metrics;
  analysis: Analysis | null;
  model: string;
};

/** Runs (or reuses) a quick check and returns its id. Throws user-facing errors. */
export async function runQuickCheck(url: URL, ip: string): Promise<string> {
  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  const cached = await cachedCheck(domain);
  if (cached) return cached;

  await takeQuota(ip);

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
    });
  await db().collection("checkCache").doc(domain).set({ checkId: id, createdAt: FieldValue.serverTimestamp() });
  return id;
}

export async function getCheck(id: string): Promise<StoredCheck | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return null;
  const snap = await db().collection("checks").doc(id).get();
  return snap.exists ? (snap.data() as StoredCheck) : null;
}
