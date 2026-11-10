import "server-only";
import * as cheerio from "cheerio";
import { FetchBlockedError, safeFetch, USER_AGENT } from "./safe-fetch";

export const SAMPLE_SIZE = 15;
const MAX_SITEMAP_URLS = 5000;

export type PageData = {
  url: string;
  status: number;
  title: string;
  metaDescription: string;
  h1: string;
  lang: string;
  robots: string;
  wordCount: number;
  excerpt: string; // first ~800 chars of main text
  internalLinks: number;
  externalLinks: { domain: string; rel: string }[];
};

export type CrawlResult = {
  origin: string;
  homepage: PageData;
  pages: PageData[];
  sitemapUrlCount: number | null;
  sitemapSample: string[]; // URL paths only, for pattern analysis
  robotsBlocked: boolean;
};

// --- robots.txt -------------------------------------------------------------

type RobotsRules = { disallow: string[]; allow: string[]; sitemaps: string[] };

function parseRobots(text: string): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value) current.disallow.push(value);
    if (key === "allow" && value) current.allow.push(value);
  }
  const ours = groups.find((g) => g.agents.some((a) => a.startsWith("spamlyzebot")));
  const star = groups.find((g) => g.agents.includes("*"));
  const group = ours ?? star;
  return { disallow: group?.disallow ?? [], allow: group?.allow ?? [], sitemaps };
}

function robotsAllows(rules: RobotsRules, path: string): boolean {
  const match = (pattern: string) => {
    const re = new RegExp(
      "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"),
    );
    return re.test(path);
  };
  const longest = (list: string[]) =>
    list.filter(match).reduce((max, p) => Math.max(max, p.length), -1);
  return longest(rules.allow) >= longest(rules.disallow);
}

// --- sitemaps ---------------------------------------------------------------

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1]);
}

type SitemapLimits = { maxFiles: number; maxUrls: number; childrenPerIndex: number };
export const QUICK_LIMITS: SitemapLimits = { maxFiles: 6, maxUrls: MAX_SITEMAP_URLS, childrenPerIndex: 4 };

async function readSitemaps(
  candidates: string[],
  origin: string,
  limits: SitemapLimits = QUICK_LIMITS,
): Promise<string[] | null> {
  const urls = new Set<string>();
  let found = false;
  const queue = [...new Set(candidates)].slice(0, 3);
  let fetched = 0;
  while (queue.length && fetched < limits.maxFiles && urls.size < limits.maxUrls) {
    const sm = queue.shift()!;
    fetched++;
    try {
      const res = await safeFetch(sm, 6000);
      if (res.status !== 200 || !/<(urlset|sitemapindex)/i.test(res.body)) continue;
      found = true;
      const entries = locs(res.body);
      if (/<sitemapindex/i.test(res.body)) {
        // Prefer post/page sitemaps; take a few children.
        queue.push(...entries.slice(0, limits.childrenPerIndex));
      } else {
        for (const u of entries) {
          try {
            if (new URL(u).origin === origin) urls.add(u);
          } catch {}
          if (urls.size >= limits.maxUrls) break;
        }
      }
    } catch {}
  }
  return found ? [...urls] : null;
}

// --- HTML extraction ---------------------------------------------------------

function extract(url: string, status: number, html: string, origin: string): PageData {
  const $ = cheerio.load(html);
  const host = new URL(origin).hostname.replace(/^www\./, "");
  let internalLinks = 0;
  const externalLinks: PageData["externalLinks"] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const target = new URL(href, url);
      if (target.protocol !== "http:" && target.protocol !== "https:") return;
      const targetHost = target.hostname.replace(/^www\./, "");
      if (targetHost === host || targetHost.endsWith(`.${host}`)) internalLinks++;
      else externalLinks.push({ domain: targetHost, rel: ($(el).attr("rel") ?? "").toLowerCase() });
    } catch {}
  });

  $("script, style, noscript, svg, nav, header, footer, form, iframe").remove();
  const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = main.text().replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;

  return {
    url,
    status,
    title: $("title").first().text().trim().slice(0, 200),
    metaDescription: ($('meta[name="description"]').attr("content") ?? "").trim().slice(0, 300),
    h1: $("h1").first().text().replace(/\s+/g, " ").trim().slice(0, 200),
    lang: ($("html").attr("lang") ?? "").slice(0, 10),
    robots: ($('meta[name="robots"]').attr("content") ?? "").toLowerCase().slice(0, 100),
    wordCount: words,
    excerpt: text.slice(0, 800),
    internalLinks,
    externalLinks: externalLinks.slice(0, 200),
  };
}

function internalLinksFrom(html: string, pageUrl: string, origin: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $("a[href]").each((_, el) => {
    try {
      const u = new URL($(el).attr("href") ?? "", pageUrl);
      u.hash = "";
      if (u.origin === origin && !/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|css|js)$/i.test(u.pathname)) {
        out.add(u.toString());
      }
    } catch {}
  });
  return [...out];
}

/** Spread picks across the list so we see different sections, not just the first posts. */
export function spreadSample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

// --- main ---------------------------------------------------------------------

export class CrawlError extends Error {}

export type SiteDiscovery = {
  origin: string;
  homepage: PageData;
  robotsBlocked: boolean;
  sitemapUrlCount: number | null;
  sitemapUrls: string[];
  /** Crawlable URLs other than the homepage: sitemap URLs, or homepage links when there is no sitemap. */
  pool: string[];
};

/** Loads the homepage, robots.txt and sitemaps. Throws CrawlError or FetchBlockedError. */
export async function discoverSite(start: URL, limits: SitemapLimits = QUICK_LIMITS): Promise<SiteDiscovery> {
  let home;
  try {
    home = await safeFetch(start, 10000);
  } catch (err) {
    if (err instanceof FetchBlockedError) throw err;
    throw new CrawlError("We couldn't load your homepage. Is the site online?");
  }
  if (home.status >= 400) throw new CrawlError(`Your homepage answered with HTTP ${home.status}.`);
  if (!/html/i.test(home.contentType)) throw new CrawlError("Your homepage doesn't return an HTML page.");

  const origin = new URL(home.url).origin;

  let rules: RobotsRules = { disallow: [], allow: [], sitemaps: [] };
  try {
    const robots = await safeFetch(`${origin}/robots.txt`, 5000);
    if (robots.status === 200) rules = parseRobots(robots.body);
  } catch {}
  const robotsBlocked = !robotsAllows(rules, "/");

  const homepage = extract(home.url, home.status, home.body, origin);
  if (robotsBlocked) {
    return { origin, homepage, robotsBlocked, sitemapUrlCount: null, sitemapUrls: [], pool: [] };
  }

  const sitemapUrls = await readSitemaps(
    rules.sitemaps.length ? rules.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`],
    origin,
    limits,
  );

  const pool = (sitemapUrls && sitemapUrls.length > 0 ? sitemapUrls : internalLinksFrom(home.body, home.url, origin))
    .filter((u) => u !== home.url && u !== `${origin}/`)
    .filter((u) => robotsAllows(rules, new URL(u).pathname));

  return {
    origin,
    homepage,
    robotsBlocked,
    sitemapUrlCount: sitemapUrls ? sitemapUrls.length : null,
    sitemapUrls: sitemapUrls ?? [],
    pool,
  };
}

/** Fetches one page and extracts its data, or null when it isn't a reachable HTML page. */
export async function fetchPageData(url: string, origin: string, timeoutMs = 6000): Promise<PageData | null> {
  try {
    const res = await safeFetch(url, timeoutMs);
    if (res.status >= 400 || !/html/i.test(res.contentType)) return null;
    return extract(res.url, res.status, res.body, origin);
  } catch {
    return null;
  }
}

export async function crawl(start: URL): Promise<CrawlResult> {
  const site = await discoverSite(start);
  const { origin, homepage, robotsBlocked } = site;
  if (robotsBlocked) {
    return { origin, homepage, pages: [], sitemapUrlCount: null, sitemapSample: [], robotsBlocked };
  }

  const picks = spreadSample(site.pool, SAMPLE_SIZE - 1);
  const fetched = await mapLimit(picks, 5, (u) => fetchPageData(u, origin));

  return {
    origin,
    homepage,
    pages: fetched.filter((p): p is PageData => p !== null),
    sitemapUrlCount: site.sitemapUrlCount,
    sitemapSample: spreadSample(site.sitemapUrls, 200).map((u) => new URL(u).pathname),
    robotsBlocked,
  };
}

export { USER_AGENT };
