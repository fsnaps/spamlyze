import "server-only";
import { after } from "next/server";
import { db } from "@/lib/firebase-admin";
import { notifyAdmin } from "@/lib/notify";
import { signTask, verifySignedTask } from "@/lib/deep/tasks";
import { mergeUpdates, parseStatusFeed, SEED_UPDATES, STATUS_DASHBOARD_URL, STATUS_FEED_URL, type RankingUpdate } from "./updates";

/** One doc per update, keyed by the dashboard's incident id. Server-only, like every collection. */
const COLLECTION = "rankingUpdates";
const syncDoc = () => db().collection("aggregates").doc("rankingUpdatesSync");

export type SyncState = {
  lastRunAt?: string;
  lastOkAt?: string;
  lastError?: string;
  count?: number;
  /** Names of updates that appeared or changed status on the last successful run. */
  changes?: string[];
};

export type SyncResult = { ok: true; count: number; changes: string[] } | { ok: false; error: string };

/** Scope of the header Cloud Scheduler sends. The token is derived from API_KEY_PEPPER: no extra secret. */
const CRON_SCOPE = "cron:ranking-updates";
export const rankingCronToken = () => signTask(CRON_SCOPE);
export const verifyRankingCron = (given: string | null) => verifySignedTask(CRON_SCOPE, given);

/** Fetches the official feed and upserts every ranking update. Emails the admin when one appears or changes status. */
export async function syncRankingUpdates(): Promise<SyncResult> {
  const now = new Date().toISOString();
  try {
    const res = await fetch(STATUS_FEED_URL, {
      headers: { accept: "application/json", "user-agent": "Spamlyze (+https://spamlyze.com)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Status feed returned HTTP ${res.status}`);
    const updates = parseStatusFeed(await res.json());
    // An empty list would mean the feed changed shape: keep what we have rather than wipe it.
    if (!updates.length) throw new Error("Status feed has no ranking update");

    const col = db().collection(COLLECTION);
    const existing = new Map((await col.get()).docs.map((d) => [d.id, d.data() as RankingUpdate]));
    const firstRun = existing.size === 0;
    const changes: string[] = [];
    const batch = db().batch();
    for (const u of updates) {
      const before = existing.get(u.id!);
      const changed = !before || before.status !== u.status || before.start !== u.start || before.end !== u.end || before.name !== u.name;
      if (!changed) continue;
      if (!firstRun) {
        changes.push(
          !before
            ? `${u.name}: ${u.status === "announced" ? "announced" : `started ${u.start}`}`
            : `${u.name}: ${before.status ?? "?"} → ${u.status}${u.end ? ` (ended ${u.end})` : ""}`,
        );
      }
      batch.set(col.doc(u.id!), { ...u, syncedAt: now });
    }
    batch.set(syncDoc(), { lastRunAt: now, lastOkAt: now, count: updates.length, changes, lastError: null }, { merge: true });
    await batch.commit();
    cache = null;
    if (changes.length) {
      await notifyAdmin("updates", `Google ranking update: ${changes[0]}`, [...changes, `Source: ${STATUS_DASHBOARD_URL}`]).catch((err) =>
        console.error("ranking updates notify failed", err instanceof Error ? err.message : err),
      );
    }
    return { ok: true, count: updates.length, changes };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("ranking updates sync failed", error);
    await syncDoc()
      .set({ lastRunAt: now, lastError: error }, { merge: true })
      .catch(() => {});
    return { ok: false, error };
  }
}

export async function getSyncState(): Promise<SyncState> {
  return ((await syncDoc().get()).data() as SyncState | undefined) ?? {};
}

const CACHE_MS = 10 * 60_000;
/** Without the Scheduler job, the first visit after a day without a sync refreshes the list in the background. */
const STALE_MS = 24 * 3_600_000;
const RETRY_MS = 3_600_000;
let cache: { at: number; updates: RankingUpdate[] } | null = null;
let lastLazyAttempt = 0;

/**
 * Every known ranking update, newest first: the synced list merged over the seed. Never throws:
 * falls back to the seed. Cached for 10 minutes per instance.
 */
export async function getRankingUpdates(): Promise<RankingUpdate[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.updates;
  let updates = SEED_UPDATES;
  try {
    const [snap, state] = await Promise.all([db().collection(COLLECTION).get(), getSyncState()]);
    const synced = snap.docs.map((d) => {
      const { id, name, kind, start, end, status } = d.data() as RankingUpdate;
      return { id: id ?? d.id, name, kind, start, end: end ?? null, status };
    });
    updates = mergeUpdates(synced, SEED_UPDATES);
    const lastOk = state.lastOkAt ? Date.parse(state.lastOkAt) : 0;
    if (Date.now() - lastOk > STALE_MS && Date.now() - lastLazyAttempt > RETRY_MS) {
      lastLazyAttempt = Date.now();
      try {
        after(() => syncRankingUpdates());
      } catch {
        // Outside a request (scripts, build): no background refresh.
      }
    }
  } catch (err) {
    console.error("ranking updates read failed", err instanceof Error ? err.message : err);
  }
  cache = { at: Date.now(), updates };
  return updates;
}
