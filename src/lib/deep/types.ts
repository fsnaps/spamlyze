import type { PageData } from "@/lib/check/crawl";
import type { Metrics } from "@/lib/check/metrics";
import type { DeepAnalysis, PageVerdict } from "./analyze";
import type { GscData, PageLoss } from "@/lib/gsc/data";
import type { HitAnswer } from "@/lib/hit-answers";

export type DeepPhase = "discover" | "crawl" | "analyze" | "synthesize" | "done";
/** waiting_for_search_console: an API report that starts once the owner connects Search Console. */
export type DeepStatus = "awaiting_payment" | "waiting_for_search_console" | "running" | "done" | "failed";

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
  /** When a report that waited for Search Console started. */
  startedAt?: FirebaseFirestore.Timestamp;
  finishedAt?: FirebaseFirestore.Timestamp;
  email?: string;
  /** Set by the buyer: only browsers with the access cookie (or an admin) can open it. */
  private?: boolean;
  /** Last sign-in link sent for a private report, to throttle requests. */
  accessEmailAt?: FirebaseFirestore.Timestamp;
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
  /** API option: wait for Search Console until `until` (ms), then run without it or cancel (credits go back to the balance). */
  gscWait?: { until: number; onTimeout: "run" | "cancel" };
  /** The owner's answer to "Did your traffic drop after a spam update?" (progress page or API). */
  hitAnswer?: HitAnswer;
};

/** One crawled page, stored in deepReports/{id}/pages/{index}. */
export type DeepPage = PageData & { index: number; verdict?: PageVerdict };
