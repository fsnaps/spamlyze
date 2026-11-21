import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { CrawlError, botChallengeMessage, discoverSite, fetchPage, mapLimit, spreadSample, type PageData } from "@/lib/check/crawl";
import { FetchBlockedError } from "@/lib/check/safe-fetch";
import { computeMetrics } from "@/lib/check/metrics";
import { pageKey, type GscData, type PageLoss } from "@/lib/gsc/data";
import { stripe } from "@/lib/stripe";
import { buildSummaryInput, judgePages, synthesize, type PageVerdict } from "./analyze";
import { sendDeepReady, sendDeepStarted } from "./emails";
import { enqueueDeepStep } from "./tasks";
import { refundCharge } from "@/lib/api/credits";
import { queueReportEvent } from "@/lib/api/webhook-events";
import { notifyAdmin } from "@/lib/notify";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import { LARGE_TIER_MAX_PAGES } from "@/lib/pricing";
import type { DeepPage, DeepReport } from "./types";

/** Pages analyzed, homepage included: set by the tier paid for (older reports: 500). */
const maxPagesOf = (r: DeepReport) => r.maxPages ?? LARGE_TIER_MAX_PAGES;
/** Losing pages that may be crawled on top of a finished crawl: 20% of the tier, at most MAX_GSC_EXTRA. */
const gscExtraOf = (r: DeepReport) => Math.min(MAX_GSC_EXTRA, Math.floor(maxPagesOf(r) / 5));
const CRAWL_PER_STEP = 30;
const CRAWL_CONCURRENCY = 6;
const CRAWL_TIMEOUT_MS = 10_000;
/** Second chance for pages that timed out or were rate-limited: slower, one small batch per step. */
const RETRY_PER_STEP = 8;
const RETRY_CONCURRENCY = 2;
const RETRY_TIMEOUT_MS = 15_000;
const RETRYABLE = /^(timeout|network|http_429|http_5\d\d)$/;
const JUDGE_BATCH = 15;
const JUDGE_BATCHES_PER_STEP = 2;
const LEASE_MS = 75_000;
const MAX_FAILURES = 5;
/** Losing pages from Search Console that may be added on top of the sitemap sample. */
const MAX_GSC_EXTRA = 100;
const DEEP_SITEMAP_LIMITS = { maxFiles: 25, maxUrls: 20_000, childrenPerIndex: 20, timeoutMs: 20_000, maxBytes: 15_000_000 };

/**
 * A report is only worth delivering if we could read enough of the site. Below this, the job
 * fails (refund + admin alert) instead of handing over a report built on a handful of pages.
 */
export function lowCoverage(planned: number, crawled: number): boolean {
  if (planned < 10) return false;
  return crawled < Math.max(8, Math.ceil(planned * 0.3));
}

const reports = () => db().collection("deepReports");
const pagesOf = (id: string) => reports().doc(id).collection("pages");

export function isDeepId(id: string) {
  return /^[A-Za-z0-9_-]{16,40}$/.test(id);
}

export async function createDeepReport(
  url: URL,
  plan: Pick<DeepReport, "tier" | "maxPages" | "priceCents" | "sitemapUrlCountAtCheckout"> = {},
): Promise<string> {
  const id = randomBytes(16).toString("base64url");
  await reports()
    .doc(id)
    .set({
      status: "awaiting_payment",
      phase: "discover",
      inputUrl: url.toString(),
      domain: url.hostname.toLowerCase().replace(/^www\./, ""),
      ...plan,
      createdAt: FieldValue.serverTimestamp(),
    });
  return id;
}

/**
 * Starts a free test report (admin only, no Stripe): same job as a paid one, flagged `test`,
 * so nothing to refund if it fails. The caller checks the admin session and the daily cap.
 */
export async function startTestDeepReport(url: URL, maxPages: number, email: string): Promise<string> {
  const id = await createDeepReport(url, { tier: maxPages > 100 ? "large" : "small", maxPages, priceCents: 0 });
  await reports().doc(id).update({ status: "running", test: true, email, paidAt: FieldValue.serverTimestamp(), failures: 0 });
  await enqueueDeepStep(id, 0);
  return id;
}

export async function getDeepReport(id: string): Promise<DeepReport | null> {
  if (!isDeepId(id)) return null;
  const snap = await reports().doc(id).get();
  return snap.exists ? (snap.data() as DeepReport) : null;
}

export async function getDeepPages(id: string): Promise<DeepPage[]> {
  const snap = await pagesOf(id).orderBy("index").get();
  return snap.docs.map((d) => d.data() as DeepPage);
}

/**
 * Confirms payment with Stripe and starts the job. Safe to call many times
 * (from the success redirect and from the webhook).
 */
export async function confirmPayment(id: string, sessionId: string): Promise<boolean> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.deepId !== id || session.payment_status !== "paid") return false;
  const email = session.customer_details?.email ?? null;
  const started = await db().runTransaction(async (tx) => {
    const ref = reports().doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "awaiting_payment") return null;
    tx.update(ref, {
      status: "running",
      phase: "discover",
      paidAt: FieldValue.serverTimestamp(),
      stripeSessionId: session.id,
      email,
      failures: 0,
    });
    return { domain: snap.get("domain") as string, maxPages: (snap.get("maxPages") as number | undefined) ?? LARGE_TIER_MAX_PAGES };
  });
  // Only the call that started the job sends the email.
  if (started) {
    const amount = session.amount_total ?? 0;
    await Promise.all([
      enqueueDeepStep(id, 0),
      email ? sendDeepStarted(email, id, started.domain, started.maxPages) : null,
      track({ deepPaid: 1, revenueCents: amount }),
      notifyAdmin(
        "deep",
        `Deep Report sold: ${started.domain} · $${(amount / 100).toFixed(2)}`,
        [`Site: ${started.domain}`, `Tier: up to ${started.maxPages} pages`, `Buyer: ${email ?? "unknown"}`, `Amount: $${(amount / 100).toFixed(2)} ${session.currency?.toUpperCase() ?? ""}`],
        `${site.url}/deep/${id}`,
      ),
    ]);
  }
  return true;
}

/**
 * Stores imported Search Console data. The first time, the job folds the pages that lost
 * clicks into its crawl, and a finished report is reopened to update its action plan.
 */
export async function attachSearchConsole(id: string, gsc: GscData, losses: PageLoss[]) {
  await db().runTransaction(async (tx) => {
    const ref = reports().doc(id);
    const r = (await tx.get(ref)).data() as DeepReport | undefined;
    if (!r) return;
    const merge = !r.gscMerged && losses.length > 0 && !r.robotsBlocked;
    const reopen = merge && r.status === "done";
    tx.update(ref, {
      gsc,
      ...(merge ? { gscLosses: losses, gscPending: true } : {}),
      ...(reopen ? { status: "running", failures: 0, leaseUntil: 0 } : {}),
    });
  });
  // Running or just reopened: make sure the server keeps it moving even if the page is closed.
  await enqueueDeepStep(id, 0);
}

/**
 * Admin only: runs a delivered (or failed) report again from scratch, keeping its Search Console
 * data. No email goes out: the admin tells the buyer. The caller checks the site is crawlable first.
 */
export async function restartDeepReport(id: string): Promise<boolean> {
  const ref = reports().doc(id);
  const r = (await ref.get()).data() as DeepReport | undefined;
  if (!r || (r.status !== "done" && r.status !== "failed")) return false;
  const old = await pagesOf(id).get();
  for (let i = 0; i < old.docs.length; i += 400) {
    const batch = db().batch();
    for (const d of old.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  const reset = FieldValue.delete();
  await ref.update({
    status: "running",
    phase: "discover",
    failures: 0,
    leaseUntil: 0,
    gscPending: false,
    urls: reset,
    crawlCursor: reset,
    pagesCrawled: reset,
    analyzeCursor: reset,
    pagesAnalyzed: reset,
    retryIndexes: reset,
    crawlErrors: reset,
    sitemapErrors: reset,
    sitemapChallenged: reset,
    robotsBlocked: reset,
    error: reset,
    rerunAt: FieldValue.serverTimestamp(),
  });
  await enqueueDeepStep(id, 0);
  return true;
}

/** Losing pages on the same site, as URLs we can crawl. */
function lossUrls(r: DeepReport): string[] {
  const host = r.origin ? new URL(r.origin).hostname.replace(/^www\./, "") : r.domain;
  return (r.gscLosses ?? [])
    .map((l) => l.url)
    .filter((u) => {
      try {
        const x = new URL(u);
        return /^https?:$/.test(x.protocol) && x.hostname.replace(/^www\./, "") === host;
      } catch {
        return false;
      }
    });
}

/** Folds the losing pages into the job, whatever phase it's in. Runs under the lease. */
function mergeGsc(r: DeepReport): Patch {
  const done = { gscPending: false, gscMerged: true };
  const urls = r.urls;
  // Not discovered yet: discover() puts the losing pages first.
  if (!urls || r.phase === "discover") return done;
  const known = new Set(urls.map(pageKey));
  const losing = lossUrls(r);
  if (r.phase === "crawl") {
    const cursor = r.crawlCursor ?? 1;
    const crawled = new Set(urls.slice(0, cursor).map(pageKey));
    const max = maxPagesOf(r);
    const first = losing.filter((u) => !crawled.has(pageKey(u))).slice(0, Math.min(MAX_GSC_EXTRA, max - 1));
    const firstKeys = new Set(first.map(pageKey));
    const rest = urls.slice(cursor).filter((u) => !firstKeys.has(pageKey(u)));
    const next = [...urls.slice(0, cursor), ...first, ...rest];
    return { ...done, urls: next.slice(0, Math.max(max, cursor + first.length)) };
  }
  // Crawl is over: crawl the missing losing pages, then review them and rewrite the plan.
  const missing = losing.filter((u) => !known.has(pageKey(u))).slice(0, gscExtraOf(r));
  if (missing.length) return { ...done, urls: [...urls, ...missing], crawlCursor: urls.length, phase: "crawl" };
  return r.phase === "done" ? { ...done, phase: "synthesize" } : done;
}

async function acquireLease(id: string): Promise<DeepReport | null> {
  return db().runTransaction(async (tx) => {
    const ref = reports().doc(id);
    const snap = await tx.get(ref);
    const data = snap.data() as DeepReport | undefined;
    if (!data || data.status !== "running") return null;
    if ((data.leaseUntil ?? 0) > Date.now()) return null;
    tx.update(ref, { leaseUntil: Date.now() + LEASE_MS });
    return data;
  });
}

/** Runs one bounded slice of work (well under a minute). Returns the report afterwards. */
export async function runStep(id: string): Promise<DeepReport | null> {
  const report = await acquireLease(id);
  if (!report) return getDeepReport(id);
  const ref = reports().doc(id);
  try {
    const patch = report.gscPending ? mergeGsc(report) : await PHASES[report.phase](id, report);
    await ref.update({ ...patch, leaseUntil: 0, error: FieldValue.delete() });
    if (patch.robotsBlocked === true && report.accountId) {
      await refund(id, report);
      await queueReportEvent(id, report.accountId, "report.failed");
    }
    // A report updated with Search Console data was already delivered once: no second email.
    if (patch.status === "done" && !report.finishedAt && !report.rerunAt) {
      const analysis = patch.analysis as { riskScore: number; riskLevel: string } | undefined;
      await Promise.all([
        report.email ? sendDeepReady(report.email, id, report.domain, analysis?.riskScore, analysis?.riskLevel) : null,
        track({ deepDone: 1 }),
        report.accountId && patch.robotsBlocked !== true ? queueReportEvent(id, report.accountId, "report.done") : null,
      ]);
    }
  } catch (err) {
    const userFacing = err instanceof CrawlError || err instanceof FetchBlockedError;
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("deep step failed", id, report.phase, message);
    const failures = (report.failures ?? 0) + 1;
    const failed = userFacing || failures >= MAX_FAILURES;
    if (failed && report.finishedAt) {
      // The Search Console update of a delivered report failed: keep the report as it was, no refund.
      await ref.update({ leaseUntil: 0, failures: 0, status: "done", phase: "done", gscPending: false, error: FieldValue.delete() });
      return getDeepReport(id);
    }
    await ref.update({
      leaseUntil: 0,
      failures,
      error: userFacing ? message : failed ? "We couldn't finish this report." : "A step failed. Retrying…",
      ...(failed ? { status: "failed" } : {}),
    });
    if (failed) {
      await refund(id, report);
      await Promise.all([
        report.accountId ? queueReportEvent(id, report.accountId, "report.failed") : null,
        track({ deepFailed: 1 }),
        notifyAdmin("deep", `Deep Report failed: ${report.domain}`, [`Reason: ${message}`, "The buyer was refunded automatically."], `${site.url}/deep/${id}`),
      ]);
    }
  }
  return getDeepReport(id);
}

/** A report we couldn't deliver is refunded in full, automatically. */
async function refund(id: string, report: DeepReport) {
  if (report.accountId && report.chargeRef) {
    // API report: the credits go back to the account's prepaid balance.
    try {
      const r = await refundCharge(report.accountId, report.chargeRef, "report failed");
      if (r && !r.replayed) await track({ apiRefundedCents: report.priceCents ?? 0 });
      await reports().doc(id).update({ refunded: true });
    } catch (err) {
      console.error("api deep refund failed", id, err instanceof Error ? err.message : err);
    }
    return;
  }
  if (!report.stripeSessionId) return;
  try {
    const session = await stripe().checkout.sessions.retrieve(report.stripeSessionId);
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!pi) return;
    await stripe().refunds.create({ payment_intent: pi }, { idempotencyKey: `deep-refund-${id}` });
    await reports().doc(id).update({ refunded: true });
  } catch (err) {
    console.error("deep refund failed", id, err instanceof Error ? err.message : err);
  }
}

type Patch = Record<string, unknown>;

const PHASES: Record<DeepReport["phase"], (id: string, r: DeepReport) => Promise<Patch>> = {
  async discover(id, r) {
    const site = await discoverSite(new URL(r.inputUrl), DEEP_SITEMAP_LIMITS);
    const home: DeepPage = { ...site.homepage, index: 0 };
    await pagesOf(id).doc("0").set(home);
    if (site.robotsBlocked) {
      return { status: "done", phase: "done", robotsBlocked: true, origin: site.origin, finishedAt: FieldValue.serverTimestamp() };
    }
    // Pages that lost clicks in Search Console (if already connected) go first.
    const homeKey = pageKey(site.homepage.url);
    const losing = lossUrls({ ...r, origin: site.origin })
      .filter((u) => pageKey(u) !== homeKey)
      .slice(0, Math.min(MAX_GSC_EXTRA, maxPagesOf(r) - 1));
    const losingKeys = new Set(losing.map(pageKey));
    const sample = spreadSample(
      site.pool.filter((u) => !losingKeys.has(pageKey(u))),
      maxPagesOf(r) - 1 - losing.length,
    );
    const urls = [site.homepage.url, ...losing, ...sample];
    return {
      phase: "crawl",
      origin: site.origin,
      robotsBlocked: false,
      sitemapUrlCount: site.sitemapUrlCount,
      sitemapStatus: site.sitemapStatus,
      sitemapErrors: site.sitemapErrors,
      sitemapChallenged: site.sitemapChallenged,
      sitemapSample: spreadSample(site.sitemapUrls, 200).map((u) => new URL(u).pathname),
      urls,
      crawlCursor: 1,
      pagesCrawled: 1,
    };
  },

  async crawl(id, r) {
    const urls = r.urls ?? [];
    const start = r.crawlCursor ?? 1;
    const retrying = start >= urls.length;
    const indexes = retrying
      ? (r.retryIndexes ?? []).slice(0, RETRY_PER_STEP)
      : urls.slice(start, start + CRAWL_PER_STEP).map((_, i) => start + i);
    const results = await mapLimit(indexes, retrying ? RETRY_CONCURRENCY : CRAWL_CONCURRENCY, (i) =>
      fetchPage(urls[i], r.origin!, retrying ? RETRY_TIMEOUT_MS : CRAWL_TIMEOUT_MS),
    );
    const batch = db().batch();
    let n = 0;
    const errors: Record<string, number> = {};
    const retry: number[] = [];
    results.forEach((res, k) => {
      const index = indexes[k];
      if (res.page) {
        batch.set(pagesOf(id).doc(String(index)), { ...res.page, index } satisfies DeepPage);
        n++;
        return;
      }
      errors[res.error] = (errors[res.error] ?? 0) + 1;
      if (!retrying && RETRYABLE.test(res.error)) retry.push(index);
    });
    await batch.commit();

    const crawled = (r.pagesCrawled ?? 0) + n;
    const remainingRetries = retrying ? (r.retryIndexes ?? []).slice(indexes.length) : [...(r.retryIndexes ?? []), ...retry];
    const next = retrying ? start : start + indexes.length;
    const finished = next >= urls.length && remainingRetries.length === 0;
    const patch: Patch = {
      crawlCursor: next,
      pagesCrawled: FieldValue.increment(n),
      retryIndexes: remainingRetries,
      ...Object.fromEntries(Object.entries(errors).map(([code, count]) => [`crawlErrors.${code}`, FieldValue.increment(count)])),
    };
    if (!finished) return patch;

    // Never hand over a report built on a handful of pages: fail, refund and alert instead.
    if (!r.finishedAt && lowCoverage(urls.length, crawled)) {
      const all = { ...(r.crawlErrors ?? {}) };
      for (const [code, count] of Object.entries(errors)) all[code] = (all[code] ?? 0) + count;
      const challenged = (all.challenge ?? 0) + (r.sitemapChallenged ? 1 : 0);
      // Keep the failure reasons on the report for diagnosis, then fail the job.
      await reports().doc(id).update(patch);
      await track({ deepLowCoverage: 1 });
      const detail = Object.entries(all)
        .map(([code, count]) => `${code} ×${count}`)
        .join(", ");
      throw new CrawlError(
        challenged > 0
          ? `${botChallengeMessage(r.domain)} We could load only ${crawled} of ${urls.length} pages.`
          : `We could load only ${crawled} of the ${urls.length} pages we planned (${detail || "no answer"}), not enough for a reliable report.`,
      );
    }
    // Back from a Search Console top-up, the review resumes where it stopped.
    return { ...patch, phase: "analyze", analyzeCursor: r.analyzeCursor ?? 0, pagesAnalyzed: r.pagesAnalyzed ?? 0 };
  },

  async analyze(id, r) {
    const cursor = r.analyzeCursor ?? 0;
    const limit = JUDGE_BATCH * JUDGE_BATCHES_PER_STEP;
    const [homeSnap, snap] = await Promise.all([
      pagesOf(id).doc("0").get(),
      pagesOf(id).where("index", ">=", cursor).orderBy("index").limit(limit).get(),
    ]);
    const pages = snap.docs.map((d) => d.data() as DeepPage);
    if (!pages.length) return { phase: "synthesize" };
    const homepage = homeSnap.data() as PageData;
    const batches: DeepPage[][] = [];
    for (let i = 0; i < pages.length; i += JUDGE_BATCH) batches.push(pages.slice(i, i + JUDGE_BATCH));
    const results = await Promise.all(batches.map((b) => judgePages(homepage, b)));
    const write = db().batch();
    results.forEach((res, bi) =>
      res.verdicts.forEach((verdict: PageVerdict, i) => {
        write.update(pagesOf(id).doc(String(batches[bi][i].index)), { verdict });
      }),
    );
    await write.commit();
    const usage = results.reduce((u, x) => ({ input: u.input + x.usage.input, output: u.output + x.usage.output }), { input: 0, output: 0 });
    return {
      analyzeCursor: pages[pages.length - 1].index + 1,
      pagesAnalyzed: FieldValue.increment(pages.length),
      "usage.input": FieldValue.increment(usage.input),
      "usage.output": FieldValue.increment(usage.output),
      ...(pages.length < limit ? { phase: "synthesize" } : {}),
    };
  },

  async synthesize(id, r) {
    const all = await getDeepPages(id);
    const homepage = all.find((p) => p.index === 0)!;
    const rest = all.filter((p) => p.index !== 0);
    const metrics = computeMetrics({
      origin: r.origin!,
      homepage,
      pages: rest,
      sitemapUrlCount: r.sitemapUrlCount ?? null,
      sitemapSample: r.sitemapSample ?? [],
      robotsBlocked: false,
    });
    const input = buildSummaryInput(
      r.origin!,
      homepage,
      all.map((p) => ({ page: p, verdict: p.verdict })),
      metrics,
      r.sitemapSample ?? [],
      r.gsc ? { gsc: r.gsc, losses: r.gscLosses ?? [] } : undefined,
      {
        sitemapStatus: r.sitemapStatus ?? (r.sitemapUrlCount == null ? "none" : "found"),
        pagesPlanned: r.urls?.length ?? all.length,
        pagesNotLoaded: r.crawlErrors ?? {},
      },
    );
    const { analysis, usage } = await synthesize(input, new Set(all.map((p) => p.url)));
    return {
      status: "done",
      phase: "done",
      metrics,
      analysis,
      finishedAt: FieldValue.serverTimestamp(),
      "usage.input": FieldValue.increment(usage.input),
      "usage.output": FieldValue.increment(usage.output),
    };
  },

  async done() {
    return {};
  },
};
