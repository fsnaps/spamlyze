import { NotYourAccount, requireMyAccount } from "@/lib/account/access";
import { getPack } from "@/lib/api/packs";
import { createCreditCheckout } from "@/lib/api/purchase";

/** POST {accountId, packId}: starts a Stripe Checkout to buy API credits for the signed-in account. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { accountId?: unknown; packId?: unknown } | null;
  const pack = getPack(body?.packId);
  if (!pack) return Response.json({ error: "Unknown pack." }, { status: 400 });
  try {
    const { id, email, account } = await requireMyAccount(body?.accountId);
    if (account.status !== "active") return Response.json({ error: "This account is suspended." }, { status: 403 });
    return Response.json({ url: await createCreditCheckout(id, email, pack) });
  } catch (err) {
    if (err instanceof NotYourAccount) return Response.json({ error: "Not your account." }, { status: 403 });
    console.error("credit checkout failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "Payments are temporarily unavailable. Please try again later." }, { status: 500 });
  }
}
