import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applicationDefault } from "firebase-admin/app";
import { site } from "@/lib/site";

// Server-side driver for Deep Reports. Until now the buyer's open page made the job advance
// (it calls /api/deep/{id}/step in a loop). With a Cloud Tasks queue configured, each step also
// schedules the next one on the server, so a report finishes even when nobody has the page open
// (closed tab, API callers). The queue caps how many steps run at once, which also caps parallel
// Claude calls. Both drivers can run together: the job's lease lets only one of them work at a time.
//
// Off until DEEP_TASKS_QUEUE is set: then nothing changes compared with the browser-only driver.
// Uses the REST API with the App Hosting service account's token: no extra dependency.

const queue = () => process.env.DEEP_TASKS_QUEUE ?? "";
const location = () => process.env.DEEP_TASKS_LOCATION || "europe-west1";
const project = () => process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "spamlyze";
/** Where tasks are delivered. Overridable for tests and staging. */
const target = () => process.env.DEEP_TASKS_TARGET_URL || site.url;
/** Tasks for the same report scheduled in the same window share a name: Cloud Tasks drops the duplicate. */
const DEDUPE_WINDOW_MS = 5_000;

export const deepTasksEnabled = () => queue() !== "";

/** Swappable in tests. */
export const taskDeps = {
  accessToken: async () => (await applicationDefault().getAccessToken()).access_token,
};

/** Proves a task request comes from us. Derived from the API_KEY_PEPPER secret: no extra secret to manage. */
export function signTask(scope: string): string {
  const secret = process.env.API_KEY_PEPPER || (process.env.NODE_ENV === "production" ? "" : "dev-only-task-secret");
  if (!secret) throw new Error("API_KEY_PEPPER is not set");
  return createHmac("sha256", secret).update(scope).digest("base64url");
}

export const taskToken = (id: string) => signTask(`deep-task:${id}`);

export function verifySignedTask(scope: string, given: string | null): boolean {
  if (!given) return false;
  let expected: string;
  try {
    expected = signTask(scope);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const verifyTaskToken = (id: string, given: string | null) => verifySignedTask(`deep-task:${id}`, given);

/**
 * Creates a Cloud Tasks HTTP task that POSTs to `path` on our own site at `at`. A task with the
 * same name already scheduled counts as success (409): names are how duplicates are dropped.
 * Never throws.
 */
export async function createTask(name: string, path: string, token: string, at: number, label: string): Promise<boolean> {
  if (!deepTasksEnabled()) return false;
  try {
    const parent = `projects/${project()}/locations/${location()}/queues/${queue()}`;
    const accessToken = await taskDeps.accessToken();
    const res = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        task: {
          name: `${parent}/tasks/${name}`,
          scheduleTime: new Date(at).toISOString(),
          dispatchDeadline: "120s",
          httpRequest: { httpMethod: "POST", url: `${target()}${path}`, headers: { "x-spamlyze-task": token } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok || res.status === 409) return true;
    console.error("task enqueue failed", label, res.status, (await res.text()).slice(0, 300));
    return false;
  } catch (err) {
    console.error("task enqueue failed", label, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Schedules the next step of a report. Never throws: if the queue is missing or down,
 * the report still advances through the buyer's page, as before.
 */
export async function enqueueDeepStep(id: string, delayMs = 1_000): Promise<boolean> {
  if (!deepTasksEnabled()) return false;
  let token: string;
  try {
    token = taskToken(id);
  } catch (err) {
    console.error("deep task enqueue failed", id, err instanceof Error ? err.message : err);
    return false;
  }
  const at = Date.now() + delayMs;
  return createTask(`deep-${id}-${Math.floor(at / DEDUPE_WINDOW_MS)}`, `/api/internal/deep-step/${id}`, token, at, id);
}
