/**
 * Shared risk scoring for the Quick Check and the Deep Report.
 *
 * The AI rates each spam policy on a fixed rubric; the overall score is computed here from those
 * ratings, so it follows the worst violation (that's how spam updates act) instead of an average.
 * Bumped whenever scores stop being comparable with earlier ones.
 */
export const SCORE_VERSION = 2;

export type SignalLevel = "low" | "moderate" | "high" | "unknown";

/** What each band of a signal score means. Given to the model so 70 means the same thing on every site. */
export const RUBRIC = `Scoring rubric (0-100, the same for every signal):
- 0-14: nothing in the data points to this issue.
- 15-29: minor or isolated weaknesses (a few short pages, a couple of unqualified links) that a normal site also has.
- 30-49: a visible pattern on part of the site (one section of near-identical pages, a series of keyword or location variants, links to unrelated commercial sites on several pages).
- 50-69: a clear pattern that a spam reviewer would flag: a large share of the pages or of the sitemap is templated, thin, or built for keyword/location variants; or sitewide paid-looking links; or unrelated third-party content in a dedicated section.
- 70-89: the pattern is what the site mostly is: hundreds or thousands of thin or templated pages (e.g. one template with a name, city or product swapped), doorway series, link selling, or hosted third-party content clearly unrelated to the site.
- 90-100: blatant, site-wide spam with no meaningful original value.

Calibration examples:
- 4,000 video pages from one template, every sampled page under 200 words: scaled_content 75, thin_doorway 80.
- A web agency with ~50 "web design in [city]" pages sharing one template: thin_doorway 65.
- 30 "visa for [nationality] citizens" pages that differ mostly by the nationality: thin_doorway 55.
- A small business site with 12 distinct service pages, a few short legal pages: every signal 5-15.
- A blog with long, varied articles and a few affiliate links marked rel="sponsored": link_schemes 10.

How to score:
- Score what the data shows. Don't lower a score because the sample is small: uncertainty is shown to the user separately. Say "the sampled pages suggest..." in the text instead.
- metrics.urlSeries lists families of sitemap URLs that share one slug pattern, with their estimated size on the whole site. A large family whose members differ only by a city, nationality, name or keyword is strong evidence for thin_doorway and scaled_content, even if the sampled pages are long. A family that is just ordinary articles (e.g. "how-to-..." posts on different topics) is not.
- metrics.estimatedThinPages extrapolates the thin share of the sample to the whole site.
- A business model that itself breaks Google's policies (selling fake reviews, installs or ratings, link selling, hacked or cloaked content) scores 50+ on the closest signal, and the finding says why.
- level follows the score: low under 30, moderate 30-59, high 60+. Use "unknown" with score 0 only when the data gives no basis at all.`;

export function levelFor(score: number): Exclude<SignalLevel, "unknown"> {
  return score >= 60 ? "high" : score >= 30 ? "moderate" : "low";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Overall risk from the signal scores: the worst signal, plus a little for each other signal that
 * is at least moderate (several problems together are riskier than one). Unknown signals don't count.
 */
export function overallScore(signals: { score: number; level: SignalLevel }[]): number {
  const scores = signals
    .filter((s) => s.level !== "unknown")
    .map((s) => clamp(s.score))
    .sort((a, b) => b - a);
  if (!scores.length) return 0;
  const [worst, ...rest] = scores;
  const bonus = rest.filter((s) => s >= 30).reduce((sum, s, i) => sum + s * (i === 0 ? 0.15 : 0.08), 0);
  return clamp(worst + bonus);
}

/** Makes signal levels agree with their scores (the model sometimes says "low" for a 45). */
export function normalizeSignal<T extends { score: number; level: SignalLevel }>(s: T): T {
  if (s.level === "unknown") return { ...s, score: 0 };
  const score = clamp(s.score);
  return { ...s, score, level: levelFor(score) };
}

// --- URL series ------------------------------------------------------------------------

export type UrlSeries = {
  /** e.g. "/strony-internetowe-*" or "/uzbekistan-visa-for-*-citizens" */
  pattern: string;
  /** Paths of the sitemap sample in this family. */
  sampled: number;
  /** Share of the sitemap sample, 0-1. */
  share: number;
  /** Estimated family size on the whole site (share × sitemap URLs). */
  estimatedPages: number;
  examples: string[];
};

const LANG_DIR = /^[a-z]{2}(-[a-z]{2})?$/i;

/** Directory (without language prefix) and slug tokens of a URL path. */
function splitPath(path: string): { dir: string; tokens: string[] } | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length && LANG_DIR.test(parts[0])) parts.shift();
  const slug = parts.pop();
  if (!slug) return null;
  const tokens = slug.replace(/\.(html?|php)$/i, "").toLowerCase().split(/[-_]+/).filter(Boolean);
  return tokens.length >= 2 ? { dir: parts.length ? `/${parts.join("/")}` : "", tokens } : null;
}

/**
 * Families of sitemap URLs built on one slug pattern: same directory and the same first two words
 * ("/strony-internetowe-*"), or the same last two words ("/*-visa-requirements"). Families of at
 * least 5 paths and 3% of the sample, biggest first.
 */
export function findUrlSeries(paths: string[], sitemapUrlCount: number | null, max = 4): UrlSeries[] {
  const unique = [...new Set(paths)];
  const families = new Map<string, Set<string>>();
  const add = (key: string, path: string) => {
    const set = families.get(key) ?? new Set<string>();
    set.add(path);
    families.set(key, set);
  };
  for (const path of unique) {
    const s = splitPath(path);
    if (!s || s.tokens.length < 3) continue;
    add(`${s.dir}/${s.tokens.slice(0, 2).join("-")}-*`, path);
    add(`${s.dir}/*-${s.tokens.slice(-2).join("-")}`, path);
  }
  const total = Math.max(unique.length, 1);
  const min = Math.max(5, Math.ceil(total * 0.03));
  const picked: UrlSeries[] = [];
  const covered = new Set<string>();
  for (const [pattern, set] of [...families.entries()].sort((a, b) => b[1].size - a[1].size)) {
    if (set.size < min || picked.length >= max) continue;
    // Skip a family that is mostly another one seen from its other end.
    const fresh = [...set].filter((p) => !covered.has(p)).length;
    if (fresh < set.size / 2) continue;
    set.forEach((p) => covered.add(p));
    const share = set.size / total;
    picked.push({
      pattern,
      sampled: set.size,
      share: Math.round(share * 100) / 100,
      estimatedPages: Math.round(share * Math.max(sitemapUrlCount ?? 0, total)),
      examples: [...set].slice(0, 4),
    });
  }
  return picked;
}
