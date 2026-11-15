import "server-only";
import { UPDATES, type RankingUpdate } from "./updates";

const API = "https://searchconsole.googleapis.com/webmasters/v3";
const WINDOW_DAYS = 28;
const MIN_AFTER_DAYS = 14;

export type DailyPoint = { d: string; c: number; i: number };
export type UpdateImpact = RankingUpdate & {
  beforeClicks: number;
  afterClicks: number;
  clicksChange: number;
  impressionsChange: number;
  verdict: "hit" | "possible" | "stable" | "gain";
};
export type PageLoss = { url: string; before: number; after: number };
export type GscData = {
  property: string;
  importedAt: string;
  daily: DailyPoint[];
  updates: UpdateImpact[];
  losers: { update: string; pages: PageLoss[] } | null;
  /** How many pages lost clicks around the worst update (shown when the list itself is withheld). */
  lostPages?: number;
};

export class GscError extends Error {
  constructor(public code: "no_property" | "api") {
    super(code);
  }
}

async function call<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    console.error("gsc api", path.split("?")[0], res.status, (await res.text()).slice(0, 300));
    throw new GscError("api");
  }
  return (await res.json()) as T;
}

/** Picks the property for this domain: domain property first, then URL-prefix ones. */
export async function findProperty(token: string, domain: string): Promise<string> {
  const { siteEntry = [] } = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(token, "/sites");
  const usable = siteEntry.filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl);
  const candidates = [
    `sc-domain:${domain}`,
    `https://${domain}/`,
    `https://www.${domain}/`,
    `http://${domain}/`,
    `http://www.${domain}/`,
  ];
  const found = candidates.find((c) => usable.includes(c));
  if (!found) throw new GscError("no_property");
  return found;
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const DAY = 86_400_000;

/** Search Console omits days with no impressions: put them back as zeros. */
export function fillGaps(points: DailyPoint[], until?: string): DailyPoint[] {
  if (!points.length) return points;
  const byDay = new Map(points.map((p) => [p.d, p]));
  const out: DailyPoint[] = [];
  const end = day(until && until > points[points.length - 1].d ? until : points[points.length - 1].d);
  for (let t = day(points[0].d); t <= end; t += DAY) out.push(byDay.get(iso(t)) ?? { d: iso(t), c: 0, i: 0 });
  return out;
}

type Row = { keys: string[]; clicks: number; impressions: number };

async function query(token: string, property: string, body: Record<string, unknown>): Promise<Row[]> {
  const { rows = [] } = await call<{ rows?: Row[] }>(
    token,
    `/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    { type: "web", ...body },
  );
  return rows;
}

function avg(points: DailyPoint[], from: number, to: number, key: "c" | "i") {
  const inRange = points.filter((p) => day(p.d) >= from && day(p.d) <= to);
  if (!inRange.length) return 0;
  return inRange.reduce((s, p) => s + p[key], 0) / inRange.length;
}

function windows(u: RankingUpdate, lastDay: number) {
  const start = day(u.start);
  const end = u.end ? day(u.end) : null;
  const before = { from: start - WINDOW_DAYS * DAY, to: start - DAY };
  const afterFrom = (end ?? start) + DAY;
  const after = { from: afterFrom, to: Math.min(afterFrom + (WINDOW_DAYS - 1) * DAY, lastDay) };
  return { before, after, enoughAfter: after.to - after.from >= (MIN_AFTER_DAYS - 1) * DAY };
}

const change = (a: number, b: number) => (a > 0 ? (b - a) / a : 0);

function verdictFor(clicksChange: number, beforeClicks: number): UpdateImpact["verdict"] {
  if (beforeClicks < 1) return "stable";
  if (clicksChange <= -0.2) return "hit";
  if (clicksChange <= -0.1) return "possible";
  if (clicksChange >= 0.1) return "gain";
  return "stable";
}

/** Imports 16 months of daily clicks/impressions and measures each known update. */
export async function importSearchData(token: string, property: string): Promise<GscData> {
  const endDate = Date.now() - 3 * DAY;
  const startDate = endDate - 485 * DAY;
  const rows = await query(token, property, {
    startDate: iso(startDate),
    endDate: iso(endDate),
    dimensions: ["date"],
    rowLimit: 25_000,
  });
  const daily = fillGaps(
    rows.map((r) => ({ d: r.keys[0], c: r.clicks, i: r.impressions })).sort((a, b) => a.d.localeCompare(b.d)),
    iso(endDate),
  );
  const first = daily.length ? day(daily[0].d) : endDate;
  const last = daily.length ? day(daily[daily.length - 1].d) : endDate;

  const updates: UpdateImpact[] = [];
  for (const u of UPDATES) {
    const w = windows(u, last);
    if (w.before.from < first || !w.enoughAfter) continue;
    const beforeClicks = avg(daily, w.before.from, w.before.to, "c");
    const afterClicks = avg(daily, w.after.from, w.after.to, "c");
    const clicksChange = change(beforeClicks, afterClicks);
    updates.push({
      ...u,
      beforeClicks,
      afterClicks,
      clicksChange,
      impressionsChange: change(avg(daily, w.before.from, w.before.to, "i"), avg(daily, w.after.from, w.after.to, "i")),
      verdict: verdictFor(clicksChange, beforeClicks),
    });
  }

  // Pages that lost the most clicks around the worst update (spam updates first on ties).
  const worst = [...updates]
    .filter((u) => u.verdict === "hit" || u.verdict === "possible")
    .sort((a, b) => a.clicksChange - b.clicksChange || (a.kind === "spam" ? -1 : 1))[0];
  let losers: GscData["losers"] = null;
  let lostPages = 0;
  if (worst) {
    const w = windows(worst, last);
    const byPage = (from: number, to: number) =>
      query(token, property, { startDate: iso(from), endDate: iso(to), dimensions: ["page"], rowLimit: 1000 });
    const [before, after] = await Promise.all([byPage(w.before.from, w.before.to), byPage(w.after.from, w.after.to)]);
    const afterMap = new Map(after.map((r) => [r.keys[0], r.clicks]));
    const beforeDays = (w.before.to - w.before.from) / DAY + 1;
    const afterDays = (w.after.to - w.after.from) / DAY + 1;
    const pages = before
      .map((r) => ({
        url: r.keys[0],
        before: Math.round((r.clicks / beforeDays) * WINDOW_DAYS),
        after: Math.round(((afterMap.get(r.keys[0]) ?? 0) / afterDays) * WINDOW_DAYS),
      }))
      .filter((p) => p.before - p.after > 0)
      .sort((a, b) => b.before - b.after - (a.before - a.after));
    losers = { update: worst.name, pages: pages.slice(0, 15) };
    lostPages = pages.length;
  }

  return { property, importedAt: new Date().toISOString(), daily, updates, losers, lostPages };
}
