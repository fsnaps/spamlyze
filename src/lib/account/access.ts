import "server-only";
import { accounts, createApiAccount, type ApiAccount } from "@/lib/api/accounts";
import { apiEnabled } from "@/lib/api/config";
import { accountEmail } from "./session";

/** Most people will have one account; an email can own a few (agencies). */
export const MAX_ACCOUNTS_PER_EMAIL = 5;
/** Active keys per account: enough for staging/production/CI, small enough to review. */
export const MAX_ACTIVE_KEYS = 10;

export async function accountsForEmail(email: string): Promise<(ApiAccount & { id: string })[]> {
  const snap = await accounts().where("email", "==", email).limit(MAX_ACCOUNTS_PER_EMAIL).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ApiAccount) }));
}

/**
 * The signed-in customer's accounts. Once the API is open to everyone, the first sign-in
 * creates an empty account (no credits, so it costs nothing until they buy some).
 * Before that, only accounts we created by hand (beta) show up.
 */
export async function myAccounts(email: string): Promise<(ApiAccount & { id: string })[]> {
  const found = await accountsForEmail(email);
  if (found.length || !apiEnabled()) return found;
  await createApiAccount({ email, name: email.split("@")[0] });
  return accountsForEmail(email);
}

export class NotYourAccount extends Error {}

/** For server actions: the account must belong to the signed-in email. Throws otherwise. */
export async function requireMyAccount(accountId: unknown): Promise<{ email: string; id: string; account: ApiAccount }> {
  const email = await accountEmail();
  if (!email || typeof accountId !== "string" || !/^acct_[A-Za-z0-9_-]{8,20}$/.test(accountId)) throw new NotYourAccount();
  const snap = await accounts().doc(accountId).get();
  const account = snap.data() as ApiAccount | undefined;
  if (!account || account.email !== email) throw new NotYourAccount();
  return { email, id: accountId, account };
}
