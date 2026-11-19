// Manages public API accounts and keys from the command line (pilot, before the self-service pages).
// Uses your Google credentials (gcloud auth application-default login) on the production project:
//   GOOGLE_CLOUD_PROJECT=spamlyze API_KEY_PEPPER=<same value as the App Hosting secret> npm run api -- <command>
// Commands:
//   create-account <email> "<name>" [--beta]   creates an account (beta = can use the API before launch)
//   create-key <accountId> "<key name>"        prints a new key ONCE
//   list-keys <accountId>
//   revoke-key <keyId>
//   show <accountId>
//   add-credits <accountId> <usd> "<note>"     manual top-up (pilot: after a bank transfer or Stripe link)
//   ledger <accountId>                         last 50 credit movements
//   set-cap <accountId> <usd>                  daily spending cap
process.env.GOOGLE_CLOUD_PROJECT ??= "spamlyze";
if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.API_KEY_PEPPER) {
  console.error("Set API_KEY_PEPPER to the value of the App Hosting secret, or keys won't match production.");
  process.exit(1);
}
// Same checks as production (refuses a short pepper).
(process.env as Record<string, string>).NODE_ENV = "production";

const { createApiAccount, getApiAccount } = await import("../src/lib/api/accounts");
const { createApiKey, listApiKeys, revokeApiKey } = await import("../src/lib/api/keys");
const { addCredits, listLedger } = await import("../src/lib/api/credits");
const { accounts } = await import("../src/lib/api/accounts");
const toCents = (usd: string | undefined) => {
  const cents = Math.round(Number(usd) * 100);
  if (!Number.isInteger(cents) || cents <= 0) throw new Error(`invalid amount in USD: ${usd}`);
  return cents;
};

const [cmd, ...args] = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));

switch (cmd) {
  case "create-account": {
    const [email, name] = positional;
    if (!email || !name) throw new Error('usage: create-account <email> "<name>" [--beta]');
    const id = await createApiAccount({ email, name, beta: args.includes("--beta") });
    console.log(`Account created: ${id}`);
    break;
  }
  case "create-key": {
    const [accountId, name = "Default"] = positional;
    if (!(await getApiAccount(accountId ?? ""))) throw new Error(`No account ${accountId}`);
    const { key, keyId, hint } = await createApiKey(accountId, name);
    console.log(`Key ${hint} (id ${keyId})\n\n  ${key}\n\nCopy it now: it is not stored and can't be shown again.`);
    break;
  }
  case "list-keys": {
    for (const k of await listApiKeys(positional[0] ?? "")) {
      const state = k.revokedAt ? "revoked" : "active";
      console.log(`${k.hint}  ${state.padEnd(7)}  ${k.name}  last used ${k.lastUsedAt?.toDate().toISOString() ?? "never"}  id ${k.keyId}`);
    }
    break;
  }
  case "revoke-key": {
    console.log((await revokeApiKey(positional[0] ?? "")) ? "Revoked." : "No active key with that id.");
    break;
  }
  case "show": {
    console.log(await getApiAccount(positional[0] ?? ""));
    break;
  }
  case "add-credits": {
    const [accountId, amount, note = ""] = positional;
    const r = await addCredits(accountId ?? "", toCents(amount), "manual", `manual_${Date.now()}`, note);
    console.log(`Added $${amount}. New balance: $${(r.balanceCents / 100).toFixed(2)}`);
    break;
  }
  case "ledger": {
    for (const e of await listLedger(positional[0] ?? "")) {
      const amt = `${e.cents > 0 ? "+" : ""}${(e.cents / 100).toFixed(2)}`;
      console.log(
        `${e.createdAt?.toDate().toISOString()}  ${e.type.padEnd(6)}  ${amt.padStart(9)}  balance ${(e.balanceAfter / 100).toFixed(2)}  ${e.reason} ${e.ref}${e.note ? `  "${e.note}"` : ""}`,
      );
    }
    break;
  }
  case "set-cap": {
    const [accountId, amount] = positional;
    await accounts().doc(accountId ?? "").update({ dailySpendCapCents: toCents(amount) });
    console.log(`Daily cap set to $${amount}.`);
    break;
  }
  default:
    console.log("Commands: create-account, create-key, list-keys, revoke-key, show, add-credits, ledger, set-cap (see the top of scripts/api-admin.mts)");
}
process.exit(0);
