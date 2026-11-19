import { API_PRICES } from "@/lib/api/config";
import { spentToday } from "@/lib/api/credits";
import { authenticate } from "@/lib/api/http";

/** GET /v1/account: who the key belongs to, the prepaid balance and the prices. */
export async function GET(request: Request) {
  const ctx = await authenticate(request);
  if (ctx instanceof Response) return ctx;
  const { account } = ctx;
  return Response.json({
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
  });
}
