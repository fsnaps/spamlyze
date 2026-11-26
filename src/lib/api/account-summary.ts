import "server-only";
import { API_PRICES } from "./config";
import { spentToday } from "./credits";
import type { ApiContext } from "./http";

/** What GET /v1/account and the MCP get_balance tool return: owner, balance, caps and prices. */
export async function accountSummary(ctx: ApiContext) {
  const { account } = ctx;
  return {
    id: ctx.accountId,
    name: account.name,
    email: account.email,
    balance: { cents: account.balanceCents, currency: "usd" },
    dailySpendCap: { cents: account.dailySpendCapCents, currency: "usd" },
    spentToday: { cents: await spentToday(ctx.accountId), currency: "usd" },
    prices: {
      quickCheck: { cents: API_PRICES.quickCheck, currency: "usd" },
      deepReport: { cents: API_PRICES.deepReport, currency: "usd" },
    },
    key: { name: ctx.key.name, hint: ctx.key.hint },
  };
}
