import type { CrawlResult, PageData } from "./crawl";

const RISKY_TERMS = [
  "casino", "betting", "bet", "poker", "slots", "coupon", "promo code", "discount code", "voucher",
  "payday", "loan", "crypto", "forex", "cbd", "viagra", "cialis", "escort", "essay writing", "replica",
];

export type Metrics = {
  pagesAnalyzed: number;
  sitemapUrlCount: number | null;
  avgWordCount: number;
  thinPageShare: number; // share of sampled pages under 300 words
  duplicateTitleShare: number;
  nearDuplicateShare: number; // share of pages whose text is >80% similar to another sampled page
  avgExternalLinksPerPage: number;
  sponsoredOrNofollowShare: number; // among external links
  topExternalDomains: { domain: string; count: number }[];
  riskyTermHits: { term: string; where: string[] }[];
  topPathPrefixes: { prefix: string; count: number }[]; // from the sitemap sample
  noindexPages: number;
};

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= words.length; i++) out.add(words.slice(i, i + 3).join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function computeMetrics(crawl: CrawlResult): Metrics {
  const pages: PageData[] = [crawl.homepage, ...crawl.pages];
  const n = pages.length;

  const titles = new Map<string, number>();
  for (const p of pages) if (p.title) titles.set(p.title.toLowerCase(), (titles.get(p.title.toLowerCase()) ?? 0) + 1);
  const dupTitles = pages.filter((p) => p.title && (titles.get(p.title.toLowerCase()) ?? 0) > 1).length;

  const sh = crawl.pages.map((p) => shingles(p.excerpt));
  let nearDup = 0;
  for (let i = 0; i < sh.length; i++) {
    for (let j = 0; j < sh.length; j++) {
      if (i !== j && jaccard(sh[i], sh[j]) > 0.8) {
        nearDup++;
        break;
      }
    }
  }

  const ext = pages.flatMap((p) => p.externalLinks);
  const domains = new Map<string, number>();
  for (const l of ext) domains.set(l.domain, (domains.get(l.domain) ?? 0) + 1);
  const flagged = ext.filter((l) => /sponsored|nofollow|ugc/.test(l.rel)).length;

  const riskyTermHits = RISKY_TERMS.map((term) => {
    const re = new RegExp(`\\b${term}\\b`, "i");
    const where = [
      ...pages.filter((p) => re.test(`${p.title} ${p.h1} ${p.url}`)).map((p) => p.url),
      ...crawl.sitemapSample.filter((path) => re.test(path.replace(/[-_/]/g, " "))),
    ];
    return { term, where: [...new Set(where)].slice(0, 5) };
  }).filter((h) => h.where.length > 0);

  const prefixes = new Map<string, number>();
  for (const path of crawl.sitemapSample) {
    const first = path.split("/").filter(Boolean)[0];
    const key = first ? `/${first}/` : "/";
    prefixes.set(key, (prefixes.get(key) ?? 0) + 1);
  }

  return {
    pagesAnalyzed: n,
    sitemapUrlCount: crawl.sitemapUrlCount,
    avgWordCount: Math.round(pages.reduce((s, p) => s + p.wordCount, 0) / Math.max(n, 1)),
    thinPageShare: round(crawl.pages.filter((p) => p.wordCount < 300).length / Math.max(crawl.pages.length, 1)),
    duplicateTitleShare: round(dupTitles / Math.max(n, 1)),
    nearDuplicateShare: round(nearDup / Math.max(sh.length, 1)),
    avgExternalLinksPerPage: round(ext.length / Math.max(n, 1), 1),
    sponsoredOrNofollowShare: round(flagged / Math.max(ext.length, 1)),
    topExternalDomains: [...domains.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count })),
    riskyTermHits,
    topPathPrefixes: [...prefixes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([prefix, count]) => ({ prefix, count })),
    noindexPages: pages.filter((p) => p.robots.includes("noindex")).length,
  };
}
