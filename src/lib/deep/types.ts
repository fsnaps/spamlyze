import type { PageData } from "@/lib/check/crawl";
import type { Metrics } from "@/lib/check/metrics";
import type { DeepAnalysis, PageVerdict } from "./analyze";
import type { GscData, PageLoss } from "@/lib/gsc/data";

export type DeepPhase = "discover" | "crawl" | "analyze" | "synthesize" | "done";
export type DeepStatus = "awaiting_payment" | "running" | "done" | "failed";

export type DeepReport = {
  status: DeepStatus;
  phase: DeepPhase;
  inputUrl: string;
  domain: string;
  /** Size tier paid for, and the page cap it buys (homepage included). Absent on reports before tiers: 500 pages. */
  tier?: "small" | "large";
  maxPages?: number;
  /** What the buyer was charged, in cents, before any Stripe promotion code. */
  priceCents?: number;
  /** URLs counted in the sitemap at checkout, null when there was none. */
  sitemapUrlCountAtCheckout?: number | null;
  createdAt: FirebaseFirestore.Timestamp;
  paidAt?: FirebaseFirestore.Timestamp;
  finishedAt?: FirebaseFirestore.Timestamp;
  email?: string;
  stripeSessionId?: string;
  origin?: string;
  sitemapUrlCount?: number | null;
  /** "unreadable": a sitemap exists but we couldn't read it (firewall, timeout...). */
  sitemapStatus?: "found" | "none" | "unreadable";
  sitemapErrors?: string[];
  sitemapChallenged?: boolean;
  /** Why pages couldn't be loaded, by code (timeout, challenge, http_429...). */
  crawlErrors?: Record<string, number>;
  /** Pages that timed out or were rate-limited, tried once more after the main crawl. */
  retryIndexes?: number[];
  /** Set when an admin ran the report again: no "report ready" email. */
  rerunAt?: FirebaseFirestore.Timestamp;
  /** Paths from the full sitemap, sampled, for pattern analysis. */
  sitemapSample?: string[];
  /** URLs selected for crawling (homepage first). */
  urls?: string[];
  crawlCursor?: number;
  pagesCrawled?: number;
  analyzeCursor?: number;
  pagesAnalyzed?: number;
  robotsBlocked?: boolean;
  metrics?: Metrics;
  analysis?: DeepAnalysis;
  error?: string;
  failures?: number;
  refunded?: boolean;
  /** Paid through the public API: the account charged, and the ledger ref to refund. */
  source?: "site" | "api";
  accountId?: string;
  chargeRef?: string;
  /** Free test report started from /admin: no payment, nothing to refund. */
  test?: boolean;
  leaseUntil?: number;
  usage?: { input: number; output: number };
  /** Search Console figures, imported once when the buyer connects their property. */
  gsc?: GscData;
  /** Pages that lost clicks around the worst update: crawled first, cross-referenced in the plan. */
  gscLosses?: PageLoss[];
  /** Set when Search Console was just connected: the next step folds the losing pages into the job. */
  gscPending?: boolean;
  /** The losing pages were folded in once. A later refresh only updates the figures. */
  gscMerged?: boolean;
};

/** One crawled page, stored in deepReports/{id}/pages/{index}. */
export type DeepPage = PageData & { index: number; verdict?: PageVerdict };
