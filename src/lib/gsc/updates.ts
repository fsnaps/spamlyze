/**
 * Google ranking updates. The source of truth is the Google Search Status Dashboard
 * (https://status.search.google.com, product "Ranking"), synced daily into Firestore by
 * `syncRankingUpdates` (update-feed.ts). `SEED_UPDATES` is the fallback when Firestore is empty
 * or unreachable, and the only source for updates older than the dashboard's feed.
 *
 * Dates are UTC days (YYYY-MM-DD). `end` is null while an update is rolling out.
 */
export type UpdateKind = "spam" | "core" | "other";
export type UpdateStatus = "announced" | "rolling" | "done";

export type RankingUpdate = {
  name: string;
  kind: UpdateKind;
  start: string;
  end: string | null;
  /** Missing on data stored before the feed sync (treated as "done" when `end` is set, else "rolling"). */
  status?: UpdateStatus;
  /** Incident id on the Status Dashboard. */
  id?: string;
};

export const STATUS_DASHBOARD_URL = "https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history";
export const STATUS_FEED_URL = "https://status.search.google.com/incidents.json";
/** "Ranking" on the Status Dashboard. */
export const RANKING_PRODUCT = "rGHU1u87FJnkP6W2GwMi";

/**
 * Checked against the dashboard on 2026-11-26. Entries before December 2025 are no longer in
 * the feed: they come from the dashboard's history page as recorded earlier.
 */
export const SEED_UPDATES: RankingUpdate[] = [
  { id: "AXrqxXXdtSjj3672ux7X", name: "December 2026 core update", kind: "core", start: "2026-11-24", end: null, status: "announced" },
  { id: "WLxcJyC6jMWMfryxsKMc", name: "November 2026 core update", kind: "core", start: "2026-11-10", end: "2026-11-24", status: "done" },
  { id: "XhUDXP7A67iHCD2kmbVu", name: "September 2026 spam update", kind: "spam", start: "2026-09-24", end: "2026-10-08", status: "done" },
  { id: "LEubPCm2octf2uMqCFKE", name: "August 2026 spam update", kind: "spam", start: "2026-08-18", end: "2026-08-21", status: "done" },
  { id: "YUX1peHev5a4fkxLDiUQ", name: "June 2026 spam update", kind: "spam", start: "2026-06-24", end: "2026-06-26", status: "done" },
  { id: "wdAXJk6LRRihEjpzEeWE", name: "May 2026 core update", kind: "core", start: "2026-05-21", end: "2026-06-02", status: "done" },
  { id: "7eTbAa2jWdToLkraZj5y", name: "March 2026 core update", kind: "core", start: "2026-03-27", end: "2026-04-08", status: "done" },
  { id: "VbnSXAH4SmEcxPtx4YSD", name: "March 2026 spam update", kind: "spam", start: "2026-03-24", end: "2026-03-25", status: "done" },
  { id: "mYbNTqV1ytDc2fA8hUz4", name: "February 2026 Discover core update", kind: "other", start: "2026-02-05", end: "2026-02-27", status: "done" },
  { id: "DsirqJ1gpPRgVQeccPRv", name: "December 2025 core update", kind: "core", start: "2025-12-11", end: "2025-12-29", status: "done" },
  { name: "August 2025 spam update", kind: "spam", start: "2025-08-26", end: "2025-09-21", status: "done" },
  { name: "June 2025 core update", kind: "core", start: "2025-06-30", end: "2025-07-16", status: "done" },
  { name: "March 2025 core update", kind: "core", start: "2025-03-13", end: "2025-03-26", status: "done" },
];

export const statusOf = (u: RankingUpdate): UpdateStatus => u.status ?? (u.end ? "done" : "rolling");

/** Spam and core updates of web search: what a traffic chart and the before/after analysis use. */
export const isSearchUpdate = (u: RankingUpdate) => u.kind !== "other" && statusOf(u) !== "announced";

/**
 * Discover-only updates don't touch web search clicks: "other". Anything else that isn't
 * clearly spam or core (reviews, helpful content, link spam is spam) is "other" too.
 */
export function kindOf(name: string): UpdateKind {
  if (/discover/i.test(name)) return "other";
  if (/spam/i.test(name)) return "spam";
  if (/core update/i.test(name)) return "core";
  return "other";
}

type FeedUpdate = { when?: string; text?: string; status?: string };
type FeedIncident = {
  id?: string;
  begin?: string;
  end?: string;
  external_desc?: string;
  service_key?: string;
  affected_products?: { id?: string }[];
  updates?: FeedUpdate[];
};

const RELEASED = /^\s*(released|started|began|rolling out|the rollout (has )?(started|began))/i;
const PREANNOUNCED = /pre-?announc|scheduled for/i;
const utcDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/**
 * Turns the dashboard's incidents.json into ranking updates. A preannounced update has an
 * incident (its `begin` is the announcement) but no rollout yet: it stays "announced" until an
 * update entry says it was released, and its start is the release, not the announcement.
 * Malformed entries are skipped, never guessed.
 */
export function parseStatusFeed(feed: unknown): RankingUpdate[] {
  if (!Array.isArray(feed)) throw new Error("Status feed is not an array");
  const out: RankingUpdate[] = [];
  for (const raw of feed as FeedIncident[]) {
    const ranking =
      raw?.service_key === RANKING_PRODUCT || (raw?.affected_products ?? []).some((p) => p?.id === RANKING_PRODUCT);
    const name = raw?.external_desc?.trim();
    if (!ranking || !raw.id || !name || !raw.begin || Number.isNaN(Date.parse(raw.begin))) continue;
    const updates = (raw.updates ?? [])
      .filter((u) => u?.when && !Number.isNaN(Date.parse(u.when)))
      .sort((a, b) => Date.parse(a.when!) - Date.parse(b.when!));
    const release = updates.find((u) => RELEASED.test(u.text ?? ""));
    const announcedOnly = !release && updates.length > 0 && updates.every((u) => PREANNOUNCED.test(u.text ?? ""));
    const ended = raw.end && !Number.isNaN(Date.parse(raw.end)) ? utcDay(raw.end) : null;
    const status: UpdateStatus = ended ? "done" : announcedOnly ? "announced" : "rolling";
    const firstIsPreannouncement = updates.length > 0 && PREANNOUNCED.test(updates[0].text ?? "");
    const start = release && firstIsPreannouncement ? utcDay(release.when!) : utcDay(raw.begin);
    out.push({ id: raw.id, name, kind: kindOf(name), start, end: ended, status });
  }
  return out.sort((a, b) => b.start.localeCompare(a.start));
}

/**
 * Feed entries win over seed entries with the same id or name. Seed entries the feed no longer
 * lists (older ones) are kept. Newest first.
 */
export function mergeUpdates(primary: RankingUpdate[], fallback: RankingUpdate[]): RankingUpdate[] {
  const ids = new Set(primary.map((u) => u.id).filter(Boolean));
  const names = new Set(primary.map((u) => u.name.toLowerCase()));
  const rest = fallback.filter((u) => !(u.id && ids.has(u.id)) && !names.has(u.name.toLowerCase()));
  return [...primary, ...rest].sort((a, b) => b.start.localeCompare(a.start));
}

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

/**
 * Other search updates whose rollout overlaps this one or sits within `marginDays` of it: a
 * drop can't be pinned on one of them alone.
 */
export function overlapping(u: RankingUpdate, all: RankingUpdate[], marginDays = 7, today = new Date().toISOString().slice(0, 10)): string[] {
  const s = t(u.start) - marginDays * DAY;
  const e = t(u.end ?? today) + marginDays * DAY;
  return all
    .filter((o) => o.name !== u.name && isSearchUpdate(o))
    .filter((o) => t(o.start) <= e && t(o.end ?? today) >= s)
    .map((o) => o.name);
}
