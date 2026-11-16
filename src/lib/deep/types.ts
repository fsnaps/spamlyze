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
  createdAt: FirebaseFirestore.Timestamp;
  paidAt?: FirebaseFirestore.Timestamp;
  finishedAt?: FirebaseFirestore.Timestamp;
  email?: string;
  stripeSessionId?: string;
  origin?: string;
  sitemapUrlCount?: number | null;
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
