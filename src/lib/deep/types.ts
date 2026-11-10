import type { PageData } from "@/lib/check/crawl";
import type { Metrics } from "@/lib/check/metrics";
import type { DeepAnalysis, PageVerdict } from "./analyze";

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
};

/** One crawled page, stored in deepReports/{id}/pages/{index}. */
export type DeepPage = PageData & { index: number; verdict?: PageVerdict };
