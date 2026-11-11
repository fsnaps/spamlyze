import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { CrawlError, discoverSite, fetchPageData, mapLimit, spreadSample, type PageData } from "@/lib/check/crawl";
import { FetchBlockedError } from "@/lib/check/safe-fetch";
import { computeMetrics } from "@/lib/check/metrics";
import { stripe } from "@/lib/stripe";
import { buildSummaryInput, judgePages, synthesize, type PageVerdict } from "./analyze";
import { sendDeepReady, sendDeepStarted } from "./emails";
import { notifyAdmin } from "@/lib/notify";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import type { DeepPage, DeepReport } from "./types";

export const MAX_PAGES = 500;
const CRAWL_PER_STEP = 40;
const CRAWL_CONCURRENCY = 8;
const JUDGE_BATCH = 15;
const JUDGE_BATCHES_PER_STEP = 2;
const LEASE_MS = 75_000;
const MAX_FAILURES = 5;
const DEEP_SITEMAP_LIMITS = { maxFiles: 25, maxUrls: 20_000, childrenPerIndex: 20 };

const reports = () => db().collection("deepReports");
const pagesOf = (id: string) => reports().doc(id).collection("pages");

export function isDeepId(id: string) {
  return /^[A-Za-z0-9_-]{16,40}$/.test(id);
}

export async function createDeepReport(url: URL): Promise<string> {
  const id = randomBytes(16).toString("base64url");
  await reports()
    .doc(id)
    .set({
      status: "awaiting_payment",
      phase: "discover",
      inputUrl: url.toString(),
      domain: url.hostname.toLowerCase().replace(/^www\./, ""),
      createdAt: FieldValue.serverTimestamp(),
    });
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
    return snap.get("domain") as string;
  });
  // Only the call that started the job sends the email.
  if (started) {
    const amount = session.amount_total ?? 0;
    await Promise.all([
      email ? sendDeepStarted(email, id, started) : null,
      track({ deepPaid: 1, revenueCents: amount }),
      notifyAdmin(
        "deep",
        `Deep Report sold: ${started} · $${(amount / 100).toFixed(2)}`,
        [`Site: ${started}`, `Buyer: ${email ?? "unknown"}`, `Amount: $${(amount / 100).toFixed(2)} ${session.currency?.toUpperCase() ?? ""}`],
        `${site.url}/deep/${id}`,
      ),
    ]);
  }
  return true;
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
    const patch = await PHASES[report.phase](id, report);
    await ref.update({ ...patch, leaseUntil: 0, error: FieldValue.delete() });
    if (patch.status === "done") {
      const analysis = patch.analysis as { riskScore: number; riskLevel: string } | undefined;
      await Promise.all([
        report.email ? sendDeepReady(report.email, id, report.domain, analysis?.riskScore, analysis?.riskLevel) : null,
        track({ deepDone: 1 }),
      ]);
    }
  } catch (err) {
    const userFacing = err instanceof CrawlError || err instanceof FetchBlockedError;
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("deep step failed", id, report.phase, message);
    const failures = (report.failures ?? 0) + 1;
    const failed = userFacing || failures >= MAX_FAILURES;
    await ref.update({
      leaseUntil: 0,
      failures,
      error: userFacing ? message : failed ? "We couldn't finish this report." : "A step failed. Retrying…",
      ...(failed ? { status: "failed" } : {}),
    });
    if (failed) {
      await refund(id, report);
      await Promise.all([
        track({ deepFailed: 1 }),
        notifyAdmin("deep", `Deep Report failed: ${report.domain}`, [`Reason: ${message}`, "The buyer was refunded automatically."], `${site.url}/deep/${id}`),
      ]);
    }
  }
  return getDeepReport(id);
}

/** A report we couldn't deliver is refunded in full, automatically. */
async function refund(id: string, report: DeepReport) {
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
    const urls = [site.homepage.url, ...spreadSample(site.pool, MAX_PAGES - 1)];
    return {
      phase: "crawl",
      origin: site.origin,
      robotsBlocked: false,
      sitemapUrlCount: site.sitemapUrlCount,
      sitemapSample: spreadSample(site.sitemapUrls, 200).map((u) => new URL(u).pathname),
      urls,
      crawlCursor: 1,
      pagesCrawled: 1,
    };
  },

  async crawl(id, r) {
    const urls = r.urls ?? [];
    const start = r.crawlCursor ?? 1;
    const slice = urls.slice(start, start + CRAWL_PER_STEP);
    const fetched = await mapLimit(slice, CRAWL_CONCURRENCY, (u) => fetchPageData(u, r.origin!));
    const batch = db().batch();
    let n = 0;
    fetched.forEach((page, i) => {
      if (!page) return;
      batch.set(pagesOf(id).doc(String(start + i)), { ...page, index: start + i } satisfies DeepPage);
      n++;
    });
    await batch.commit();
    const next = start + slice.length;
    return {
      crawlCursor: next,
      pagesCrawled: FieldValue.increment(n),
      ...(next >= urls.length ? { phase: "analyze", analyzeCursor: 0, pagesAnalyzed: 0 } : {}),
    };
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
