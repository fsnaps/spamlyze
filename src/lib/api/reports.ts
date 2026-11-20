import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { CrawlError, discoverSite } from "@/lib/check/crawl";
import { FetchBlockedError, normalizeInputUrl } from "@/lib/check/safe-fetch";
import { getDeepPages, getDeepReport, isDeepId } from "@/lib/deep/job";
import { LARGE_TIER_MAX_PAGES as MAX_PAGES } from "@/lib/pricing";
import { publicStatus } from "@/lib/deep/status";
import { deepTasksEnabled, enqueueDeepStep } from "@/lib/deep/tasks";
import type { DeepReport } from "@/lib/deep/types";
import { db } from "@/lib/firebase-admin";
import { notifyAdmin } from "@/lib/notify";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import { API_PRICES } from "./config";
import { chargeCredits, CreditError, refundCharge } from "./credits";
import { apiError, creditErrorResponse, type ApiContext } from "./http";

/** Deep Reports one account may have running at once. */
const MAX_RUNNING_PER_ACCOUNT = () => Number(process.env.API_MAX_RUNNING_REPORTS ?? 3);
/** Deep Reports running at once for all API accounts together (Claude rate limits, cost). */
const MAX_RUNNING_GLOBAL = () => Number(process.env.API_MAX_RUNNING_REPORTS_GLOBAL ?? 10);
/** One API Deep Report per domain per hour, all accounts together: no hammering a third-party site. */
const DOMAIN_COOLDOWN_MS = () => Number(process.env.API_REPORT_DOMAIN_COOLDOWN_MIN ?? 60) * 60_000;

const reports = () => db().collection("deepReports");

/** Reserves the domain for the cooldown, or returns when it frees up. */
async function takeDomain(domain: string): Promise<{ ok: true } | { ok: false; until: number }> {
  const ref = db().collection("apiDomainLocks").doc(domain.slice(0, 200));
  return db().runTransaction(async (tx) => {
    const until = ((await tx.get(ref)).get("until") as number) ?? 0;
    if (until > Date.now()) return { ok: false as const, until };
    const next = Date.now() + DOMAIN_COOLDOWN_MS();
    tx.set(ref, { until: next, expiresAt: Timestamp.fromMillis(next) });
    return { ok: true as const };
  });
}

async function releaseDomain(domain: string) {
  await db().collection("apiDomainLocks").doc(domain.slice(0, 200)).delete().catch(() => undefined);
}

async function runningCount(accountId?: string): Promise<number> {
  let q = reports().where("source", "==", "api").where("status", "==", "running");
  if (accountId) q = q.where("accountId", "==", accountId);
  return (await q.count().get()).data().count;
}

/** The public JSON shape of a Deep Report: progress while running, results once done. */
export async function serializeReport(id: string, r: DeepReport, withPages: boolean) {
  const s = publicStatus(r);
  const done = r.status === "done" && !r.robotsBlocked;
  const pages = done && withPages ? await getDeepPages(id) : [];
  return {
    id,
    object: "deep_report",
    domain: r.domain,
    url: r.origin ?? r.inputUrl,
    status: r.robotsBlocked ? "failed" : r.status,
    phase: r.phase,
    createdAt: r.createdAt?.toDate().toISOString() ?? null,
    finishedAt: r.finishedAt?.toDate().toISOString() ?? null,
    progress: { pagesPlanned: s.pagesPlanned, pagesCrawled: s.pagesCrawled, pagesAnalyzed: s.pagesAnalyzed },
    maxPages: r.maxPages ?? MAX_PAGES,
    error: r.robotsBlocked ? "This site's robots.txt does not allow SpamlyzeBot." : r.status === "failed" ? s.error : null,
    refunded: Boolean(r.refunded),
    reportUrl: `${site.url}/deep/${id}`,
    ...(done
      ? {
          analysis: r.analysis ?? null,
          metrics: r.metrics ?? null,
          ...(withPages
            ? { pages: pages.map((p) => ({ url: p.url, title: p.title, words: p.wordCount, verdict: p.verdict ?? null })) }
            : {}),
        }
      : {}),
  };
}

/**
 * POST /v1/reports. Checks the site, charges the account, and starts a Deep Report that the
 * server drives to the end (Cloud Tasks). Returns at once with the id: poll GET /v1/reports/{id}.
 * A report that fails or is blocked by robots.txt is refunded automatically.
 */
export async function createApiReport(ctx: ApiContext, body: { url?: unknown; maxPages?: unknown }): Promise<Response> {
  if (!deepTasksEnabled()) {
    return apiError(503, "unavailable", "Deep Reports are temporarily unavailable through the API.");
  }
  let url: URL;
  try {
    url = normalizeInputUrl(typeof body.url === "string" ? body.url : "");
  } catch (err) {
    return apiError(400, "invalid_url", err instanceof Error ? err.message : "Invalid URL.");
  }
  const maxPages = body.maxPages === undefined ? MAX_PAGES : Number(body.maxPages);
  if (!Number.isInteger(maxPages) || maxPages < 10 || maxPages > MAX_PAGES) {
    return apiError(400, "invalid_max_pages", `maxPages must be a whole number from 10 to ${MAX_PAGES}.`);
  }

  // Capacity before money: nothing is charged for a request we can't run now.
  if ((await runningCount(ctx.accountId)) >= MAX_RUNNING_PER_ACCOUNT()) {
    return apiError(429, "too_many_running", `At most ${MAX_RUNNING_PER_ACCOUNT()} Deep Reports can run at the same time per account.`, {
      "retry-after": "60",
    });
  }
  if ((await runningCount()) >= MAX_RUNNING_GLOBAL()) {
    return apiError(503, "busy", "We're running many reports right now. Please retry in a few minutes.", { "retry-after": "120" });
  }

  // The site must answer and allow us before we charge (same check as the website checkout).
  try {
    const found = await discoverSite(url);
    if (found.robotsBlocked) return apiError(422, "robots_blocked", "This site's robots.txt does not allow SpamlyzeBot. You were not charged.");
  } catch (err) {
    if (err instanceof FetchBlockedError || err instanceof CrawlError) {
      return apiError(422, "site_unreachable", `${err.message} You were not charged.`);
    }
    return apiError(422, "site_unreachable", "We couldn't load this site's homepage. You were not charged.");
  }

  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  const lock = await takeDomain(domain);
  if (!lock.ok) {
    const wait = Math.ceil((lock.until - Date.now()) / 1000);
    return apiError(429, "domain_cooldown", `A Deep Report of ${domain} ran less than an hour ago. Fetch that one, or retry in ${Math.ceil(wait / 60)} min.`, {
      "retry-after": String(wait),
    });
  }

  const id = randomBytes(16).toString("base64url");
  const chargeRef = `rp_${id}`;
  const price = API_PRICES.deepReport;
  let balanceCents: number;
  try {
    balanceCents = (await chargeCredits(ctx.accountId, price, "deep_report", chargeRef)).balanceCents;
  } catch (err) {
    await releaseDomain(domain);
    if (err instanceof CreditError) return creditErrorResponse(err);
    throw err;
  }

  try {
    await reports()
      .doc(id)
      .set({
        status: "running",
        phase: "discover",
        inputUrl: url.toString(),
        domain,
        maxPages,
        priceCents: price,
        source: "api",
        accountId: ctx.accountId,
        chargeRef,
        createdAt: FieldValue.serverTimestamp(),
        paidAt: FieldValue.serverTimestamp(),
        failures: 0,
      });
  } catch (err) {
    await refundCharge(ctx.accountId, chargeRef, "could not start");
    await releaseDomain(domain);
    console.error("api report create failed", err);
    return apiError(500, "internal_error", "Something went wrong on our side. You were not charged.");
  }

  await Promise.all([
    enqueueDeepStep(id, 0),
    track({ apiDeepReports: 1, apiChargedCents: price }),
    notifyAdmin("deep", `API Deep Report: ${domain}`, [`Account: ${ctx.account.name} (${ctx.accountId})`, `Pages: up to ${maxPages}`], `${site.url}/deep/${id}`),
  ]);
  const report = (await getDeepReport(id))!;
  return Response.json(
    {
      ...(await serializeReport(id, report, false)),
      charged: { cents: price, currency: "usd" },
      balance: { cents: balanceCents, currency: "usd" },
    },
    { status: 202, headers: { location: `${site.url}/v1/reports/${id}` } },
  );
}

/** GET /v1/reports/{id}[?pages=true]: only this account's reports. */
export async function getApiReport(ctx: ApiContext, id: string, withPages: boolean): Promise<Response> {
  const report = isDeepId(id) ? await getDeepReport(id) : null;
  if (!report || report.accountId !== ctx.accountId) {
    return apiError(404, "not_found", "No Deep Report with this id on your account.");
  }
  return Response.json(await serializeReport(id, report, withPages));
}
