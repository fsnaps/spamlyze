/** How much of the site a Quick Check saw: sitemap URLs plus the homepage. */
export function coverage(sampled: number, sitemapCount: number | null | undefined) {
  const total = typeof sitemapCount === "number" ? sitemapCount + 1 : null;
  const share = total ? Math.min(100, Math.max(1, Math.round((sampled / total) * 100))) : null;
  const unseen = total ? Math.max(0, total - sampled) : 0;
  return { total, share, unseen };
}
