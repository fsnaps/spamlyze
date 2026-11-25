import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { notifyAdmin } from "@/lib/notify";
import { site } from "@/lib/site";
import { PRICES } from "@/lib/stats";
import { accounts } from "./accounts";
import { apiError } from "./http";

// What the API costs us in Claude tokens, per account and per day, and a global daily budget.
// Costs are kept in micro-dollars (1e-6 USD) so small Quick Checks don't round to zero.
//   apiAccounts/{id}/usage/{day}.claudeCostMicros   per account and day (next to spentCents)
//   apiCost/{day}.micros                            all API accounts together
// The budget only stops NEW paid requests: reports already running always finish.

const utcDay = () => new Date().toISOString().slice(0, 10);
const dayDoc = (day = utcDay()) => db().collection("apiCost").doc(day);

/** Daily Claude budget for the whole API, in micro-dollars (env API_DAILY_CLAUDE_BUDGET_USD, default $100). */
export const apiClaudeBudgetMicros = () => Math.round(Number(process.env.API_DAILY_CLAUDE_BUDGET_USD ?? 100) * 1_000_000);

export function costMicros(model: string, usage: { input: number; output: number }): number {
  const p = model.includes("opus") ? PRICES.opus : PRICES.haiku;
  // PRICES are USD per million tokens, so tokens × price = micro-dollars.
  return Math.round(usage.input * p.input + usage.output * p.output);
}

/** Records the Claude cost of an API request. Never throws. */
export async function recordApiClaudeCost(
  accountId: string,
  model: string,
  usage: { input: number; output: number },
  reportId?: string,
): Promise<void> {
  const micros = costMicros(model, usage);
  if (micros <= 0) return;
  const day = utcDay();
  try {
    await Promise.all([
      accounts().doc(accountId).collection("usage").doc(day).set({ day, claudeCostMicros: FieldValue.increment(micros) }, { merge: true }),
      dayDoc(day).set({ day, micros: FieldValue.increment(micros) }, { merge: true }),
      reportId ? db().collection("deepReports").doc(reportId).update({ claudeCostMicros: FieldValue.increment(micros) }) : null,
    ]);
    await alertIfNeeded(day);
  } catch (err) {
    console.error("api cost record failed", accountId, err instanceof Error ? err.message : err);
  }
}

export async function apiClaudeSpentToday(): Promise<number> {
  return ((await dayDoc().get()).get("micros") as number) ?? 0;
}

/** True while today's API Claude spend is under the budget. */
export async function withinApiBudget(): Promise<boolean> {
  return (await apiClaudeSpentToday()) < apiClaudeBudgetMicros();
}

/** One admin email at 80 % and one at 100 % of the budget, per day. */
async function alertIfNeeded(day: string): Promise<void> {
  const spent = ((await dayDoc(day).get()).get("micros") as number) ?? 0;
  const budget = apiClaudeBudgetMicros();
  for (const level of [100, 80]) {
    if (spent < (budget * level) / 100) continue;
    try {
      await db().collection("apiCost").doc(`${day}_alert${level}`).create({ at: FieldValue.serverTimestamp() });
    } catch {
      return; // already sent today
    }
    const usd = (m: number) => `$${(m / 1_000_000).toFixed(2)}`;
    await notifyAdmin(
      "deep",
      level === 100 ? `API paused: Claude budget of ${usd(budget)} reached today` : `API at 80% of today's Claude budget`,
      [
        `Spent today (UTC): ${usd(spent)} of ${usd(budget)}.`,
        level === 100
          ? "New paid API requests get 503 budget_exhausted until midnight UTC. Running reports finish. Raise API_DAILY_CLAUDE_BUDGET_USD to resume."
          : "At 100%, new paid API requests are paused until midnight UTC.",
      ],
      `${site.url}/admin/api`,
    );
    return;
  }
}

/** 503 sent while the daily budget is spent; retry-after points at midnight UTC. */
export function budgetExhausted(): Response {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return apiError(503, "budget_exhausted", "The API is paused for today after unusually high demand. Nothing was charged. Please retry after midnight UTC.", {
    "retry-after": String(Math.ceil((midnight - now.getTime()) / 1000)),
  });
}
