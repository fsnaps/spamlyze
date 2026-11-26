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

type Coverage = ReturnType<typeof coverage>;
const fmt = (x: number) => x.toLocaleString("en-US");

/**
 * What a Quick Check leads with. A score from a 15-page sample of a 400-page site reads as
 * "my site is fine", so unless every page was checked, the headline is what we saw on the
 * sample and how much we didn't see; the score becomes a secondary "sample score".
 * Shared by the report page, the emails and the public API so they never disagree.
 */
export function quickHeadline(sampled: number, c: Coverage, flagged: number) {
  /** The score describes the whole site only when every page we found was analyzed. */
  const scoreIsVerdict = c.complete;
  const onSample = `on the ${sampled} ${pagesWord(sampled)} we checked`;
  const title =
    flagged > 0 ? `${flagged} warning ${flagged === 1 ? "sign" : "signs"} ${onSample}` : `No major warning sign ${onSample}`;
  const unchecked =
    c.total !== null
      ? `${fmt(c.unseen)} of your ${fmt(c.total)} pages ${c.unseen === 1 ? "wasn't" : "weren't"} checked`
      : "We found no sitemap, so we can't tell how many pages weren't checked";
  const detail =
    c.total !== null
      ? `${unchecked}${flagged > 0 ? ", so we can't tell how far these go" : ", so this doesn't clear the rest of your site"}.`
      : `${unchecked}.`;
  return { scoreIsVerdict, title, unchecked, detail };
}
