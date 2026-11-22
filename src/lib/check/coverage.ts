import type { Metrics } from "./metrics";

/**
 * How much of the site a Quick Check saw. The total is never below the pages analyzed.
 * Checks made before knownPageCount existed fall back to sitemap URLs plus the homepage.
 */
export function coverage(sampled: number, metrics: Pick<Metrics, "sitemapUrlCount" | "knownPageCount">) {
  const known =
    typeof metrics.knownPageCount === "number"
      ? metrics.knownPageCount
      : metrics.knownPageCount === undefined && typeof metrics.sitemapUrlCount === "number" && metrics.sitemapUrlCount > 0
        ? metrics.sitemapUrlCount + 1
        : null;
  const total = known === null ? null : Math.max(known, sampled);
  const unseen = total === null ? 0 : total - sampled;
  const share = total ? Math.min(100, Math.max(1, Math.round((sampled / total) * 100))) : null;
  /** Every page we found was analyzed: no coverage warning, no "check every page" pitch. */
  const complete = total !== null && unseen === 0;
  return { total, share, unseen, complete };
}

export const pagesWord = (n: number) => (n === 1 ? "page" : "pages");
