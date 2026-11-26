import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { AnalysisError } from "@/lib/check/analyze";
import { CrawlError } from "@/lib/check/crawl";
import { cachedCheck } from "@/lib/check/guard";
import { coverage, quickHeadline } from "@/lib/check/coverage";
import { domainOf, executeQuickCheck, getCheck, type StoredCheck } from "@/lib/check/run";
import { FetchBlockedError, normalizeInputUrl } from "@/lib/check/safe-fetch";
import { db } from "@/lib/firebase-admin";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import { accounts } from "./accounts";
import { API_PRICES } from "./config";
import { chargeCredits, CreditError, refundCharge } from "./credits";
import { apiError, creditErrorResponse, type ApiContext } from "./http";

/** Quick Checks one account may run at the same time (each holds a crawl + a Claude call ~30-45 s). */
const MAX_CONCURRENT = () => Number(process.env.API_MAX_CONCURRENT_CHECKS ?? 3);
const SLOT_LEASE_MS = 90_000;

const requests = (accountId: string) => accounts().doc(accountId).collection("requests");
const inflight = (accountId: string) => db().collection("apiInflight").doc(accountId);

/** Reserves one of the account's concurrent slots. Slots expire on their own if an instance dies. */
async function takeSlot(accountId: string, requestId: string): Promise<boolean> {
  const ref = inflight(accountId);
  return db().runTransaction(async (tx) => {
    const now = Date.now();
    const slots = ((await tx.get(ref)).get("slots") as Record<string, number> | undefined) ?? {};
    const live = Object.fromEntries(Object.entries(slots).filter(([, until]) => until > now));
    if (Object.keys(live).length >= MAX_CONCURRENT()) return false;
    live[requestId] = now + SLOT_LEASE_MS;
    tx.set(ref, { slots: live, expiresAt: Timestamp.fromMillis(now + SLOT_LEASE_MS) });
    return true;
  });
}

async function releaseSlot(accountId: string, requestId: string) {
  await inflight(accountId)
    .update({ [`slots.${requestId}`]: FieldValue.delete() })
    .catch((err) => console.error("slot release failed", err instanceof Error ? err.message : err));
}

/**
 * How much of the site the check saw, so integrators don't read a sample score as a verdict.
 * scoreScope is "whole_site" only when every page we found was analyzed.
 */
export function serializeCoverage(c: StoredCheck) {
  const cov = coverage(c.pagesAnalyzed, c.metrics);
  const flagged = c.analysis?.signals.filter((s) => s.level === "moderate" || s.level === "high").length ?? 0;
  const head = quickHeadline(c.pagesAnalyzed, cov, flagged);
  return {
    headline: c.analysis ? (head.scoreIsVerdict ? null : head.title) : null,
    coverage: {
      pagesChecked: c.pagesAnalyzed,
      knownPages: cov.total,
      pagesNotChecked: cov.total === null ? null : cov.unseen,
      percent: cov.complete ? 100 : cov.share,
      complete: cov.complete,
      scoreScope: head.scoreIsVerdict ? "whole_site" : "sample",
      message: head.scoreIsVerdict
        ? `All ${cov.total} pages we found were checked: the risk score covers the whole site. It does not use Search Console traffic.`
        : `${head.detail} The risk score only describes the ${c.pagesAnalyzed} pages checked and is not a verdict on the whole site. A Deep Report checks the rest with Search Console data.`,
    },
  };
}

/** The public JSON shape of a quick check. */
export function serializeCheck(id: string, c: StoredCheck, extra: Record<string, unknown> = {}) {
  const { headline, coverage } = serializeCoverage(c);
  return {
    id,
    object: "quick_check",
    domain: c.domain,
    url: c.url,
    createdAt: c.createdAt?.toDate().toISOString() ?? null,
    pagesAnalyzed: c.pagesAnalyzed,
    note: coverage.message,
    headline,
    coverage,
    riskScore: c.analysis?.riskScore ?? null,
    riskLevel: c.analysis?.riskLevel ?? null,
    summary: c.analysis?.summary ?? null,
    signals: c.analysis?.signals ?? [],
    topIssues: c.analysis?.topIssues ?? [],
    metrics: c.metrics,
    reportUrl: `${site.url}/report/${id}`,
    ...extra,
  };
}

/**
 * POST /v1/checks. Charges the account, runs (or reuses, within 24 h) a quick check, and refunds
 * automatically when no analysis comes out of it.
 */
export async function createApiCheck(ctx: ApiContext, rawUrl: unknown): Promise<Response> {
  let url: URL;
  try {
    url = normalizeInputUrl(typeof rawUrl === "string" ? rawUrl : "");
  } catch (err) {
    return apiError(400, "invalid_url", err instanceof Error ? err.message : "Invalid URL.");
  }

  const requestId = `qc_${randomBytes(12).toString("base64url")}`;
  if (!(await takeSlot(ctx.accountId, requestId))) {
    return apiError(429, "too_many_concurrent", `At most ${MAX_CONCURRENT()} Quick Checks can run at the same time per account.`, {
      "retry-after": "15",
    });
  }

  const price = API_PRICES.quickCheck;
  const refund = async (why: string) => {
    const r = await refundCharge(ctx.accountId, requestId, why);
    if (r && !r.replayed) await track({ apiRefundedCents: price });
  };
  try {
    let balanceCents: number;
    try {
      balanceCents = (await chargeCredits(ctx.accountId, price, "quick_check", requestId)).balanceCents;
    } catch (err) {
      if (err instanceof CreditError) return creditErrorResponse(err);
      throw err;
    }
    await track({ apiChargedCents: price });

    let checkId: string;
    let cached = false;
    try {
      const reuse = await cachedCheck(domainOf(url));
      cached = reuse !== null;
      checkId = reuse ?? (await executeQuickCheck(url, { accountId: ctx.accountId }));
    } catch (err) {
      const known = err instanceof CrawlError || err instanceof FetchBlockedError || err instanceof AnalysisError;
      await refund(known ? (err as Error).message : "internal error");
      if (known) return apiError(422, "analysis_failed", `${(err as Error).message} You were not charged.`);
      console.error("API quick check failed", err);
      return apiError(500, "internal_error", "Something went wrong on our side. You were not charged. Please try again later.");
    }

    const check = await getCheck(checkId);
    if (!check?.analysis) {
      await refund(check?.robotsBlocked ? "robots.txt" : "no analysis");
      return apiError(
        422,
        check?.robotsBlocked ? "robots_blocked" : "analysis_failed",
        check?.robotsBlocked
          ? "This site's robots.txt does not allow SpamlyzeBot. You were not charged."
          : "We could not analyze this site. You were not charged.",
      );
    }

    await requests(ctx.accountId).doc(requestId).set({
      type: "quick_check",
      checkId,
      cached,
      cents: price,
      keyId: ctx.keyId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return Response.json(
      serializeCheck(checkId, check, {
        cached,
        charged: { cents: price, currency: "usd" },
        balance: { cents: balanceCents, currency: "usd" },
      }),
      { status: 201 },
    );
  } finally {
    await releaseSlot(ctx.accountId, requestId);
  }
}

/** GET /v1/checks/{id}: only checks this account requested. */
export async function getApiCheck(ctx: ApiContext, id: string): Promise<Response> {
  const notFound = () => apiError(404, "not_found", "No Quick Check with this id on your account.");
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return notFound();
  const owned = await requests(ctx.accountId).where("checkId", "==", id).limit(1).get();
  if (owned.empty) return notFound();
  const check = await getCheck(id);
  return check ? Response.json(serializeCheck(id, check)) : notFound();
}
