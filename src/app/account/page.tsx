import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { myAccounts } from "@/lib/account/access";
import { accountEmail } from "@/lib/account/session";
import type { ApiAccount } from "@/lib/api/accounts";
import { API_PRICES } from "@/lib/api/config";
import { listLedger, spentToday } from "@/lib/api/credits";
import { listApiKeys } from "@/lib/api/keys";
import { CREDIT_PACKS, packCreditCents, TOP_UP_THRESHOLDS } from "@/lib/api/packs";
import { MAX_TOP_UPS_PER_DAY } from "@/lib/api/topup";
import { fulfillFromRedirect } from "@/lib/api/purchase";
import { site } from "@/lib/site";
import { revokeKeyAction } from "./actions";
import { AutoTopUpForm, BuyCreditsForm, NewKeyForm, WebhookForm } from "./forms";

export const metadata: Metadata = { title: "API account", robots: { index: false, follow: false } };

const usd = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const date = (t: Timestamp | null | undefined) => (t ? t.toDate().toISOString().slice(0, 16).replace("T", " ") : "never");
const REASONS: Record<string, string> = { quick_check: "Quick Check", deep_report: "Deep Report", manual: "Credits added", purchase: "Credits bought", auto_top_up: "Automatic top-up" };
const what = (type: string, reason: string) =>
  type === "refund" ? `Refund: ${REASONS[reason] ?? reason}` : type === "credit" ? (REASONS[reason] ?? "Credits added") : (REASONS[reason] ?? reason);
const ERRORS: Record<string, string> = {
  expired: "The sign-in took too long. Please try again.",
  cancelled: "Sign-in was cancelled.",
  failed: "Google sign-in failed. Please try again.",
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  await connection();
  const email = await accountEmail();
  if (!email) {
    const err = (await searchParams).error;
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Your API account</h1>
        <p className="mt-3 text-muted">Sign in to see your balance, manage your API keys and your webhook.</p>
        {typeof err === "string" && ERRORS[err] && <p className="mt-4 text-sm text-red-700 dark:text-red-300">{ERRORS[err]}</p>}
        <a href="/api/account/login" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-white">
          Sign in with Google
        </a>
        <p className="mt-3 text-xs text-muted">We only read your email address.</p>
      </div>
    );
  }

  const list = await myAccounts(email);
  // Backup for the Stripe webhook: if the buyer just came back from Checkout, credit the account now.
  const purchase = (await searchParams).purchase;
  let bought: number | null = null;
  if (typeof purchase === "string" && purchase.startsWith("cs_")) {
    for (const a of list) {
      bought = await fulfillFromRedirect(a.id, purchase);
      if (bought !== null) {
        a.balanceCents = (await myAccounts(email)).find((x) => x.id === a.id)?.balanceCents ?? a.balanceCents;
        break;
      }
    }
  }
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Your API account</h1>
        <span className="text-sm text-muted">
          {email} ·{" "}
          <a href="/api/account/logout" className="underline">
            Sign out
          </a>
        </span>
      </div>
      {bought !== null && (
        <p className="mt-4 rounded-2xl border border-emerald-500/60 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">
          Payment received. {usd(bought)} of credits were added to your account.
        </p>
      )}
      {purchase === "canceled" && <p className="mt-4 text-sm text-muted">Payment canceled. Your balance is unchanged.</p>}
      {list.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-line bg-surface p-5">
          There is no API account for {email} yet. The Spamlyze API opens on December 1, 2026.{" "}
          <Link href="/#api" className="text-accent underline">
            Get notified
          </Link>
          .
        </p>
      ) : (
        list.map((a) => <AccountCard key={a.id} account={a} />)
      )}
    </>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-surface p-5 ${warn ? "border-amber-500/60" : "border-line"}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

async function AccountCard({ account: a }: { account: ApiAccount & { id: string } }) {
  const [keys, ledger, spent] = await Promise.all([listApiKeys(a.id), listLedger(a.id, 20), spentToday(a.id)]);
  const active = keys.filter((k) => !k.revokedAt);
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">
        {a.name} <span className="text-sm font-normal text-muted">{a.id}</span>
        {a.status !== "active" && <span className="ml-2 text-sm text-red-700 dark:text-red-300">suspended</span>}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Balance" value={usd(a.balanceCents)} hint="Prepaid credits." warn={a.balanceCents < API_PRICES.deepReport} />
        <Tile
          label="Spent today (UTC)"
          value={usd(spent)}
          hint={`Daily cap ${usd(a.dailySpendCapCents)}`}
          warn={spent >= a.dailySpendCapCents * 0.8}
        />
        <Tile label="Prices" value={`${usd(API_PRICES.quickCheck)} · ${usd(API_PRICES.deepReport)}`} hint="Quick Check · Deep Report" />
      </div>

      {a.status === "active" && (
        <>
          <h3 className="mt-8 font-semibold">Buy credits</h3>
          <p className="mt-1 text-xs text-muted">Prepaid, no subscription. Larger packs include bonus credits. Paid securely through Stripe.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {CREDIT_PACKS.map((p) => (
              <div key={p.id} className="rounded-2xl border border-line bg-surface p-4">
                <p className="font-medium">{p.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(p.priceCents)}</p>
                <p className="mt-1 text-xs text-muted">
                  {p.bonusCents ? `${usd(packCreditCents(p))} of credits (+${usd(p.bonusCents)} bonus)` : `${usd(p.priceCents)} of credits`}
                </p>
                <BuyCreditsForm accountId={a.id} packId={p.id} />
              </div>
            ))}
          </div>

          <h3 className="mt-8 font-semibold">Automatic top-up</h3>
          {a.paymentMethod ? (
            <>
              <p className="mt-1 text-xs text-muted">
                Charges your <span className="capitalize">{a.paymentMethod.brand}</span> card ending in {a.paymentMethod.last4}, at most {MAX_TOP_UPS_PER_DAY} times a day. If a payment
                fails we turn this off and email you.
              </p>
              {a.topUpState?.lastError && !a.autoTopUp?.enabled && (
                <p className="mt-2 text-xs text-red-700 dark:text-red-300">Last top-up failed: {a.topUpState.lastError}</p>
              )}
              <AutoTopUpForm
                accountId={a.id}
                enabled={a.autoTopUp?.enabled ?? false}
                thresholdCents={a.autoTopUp?.thresholdCents ?? TOP_UP_THRESHOLDS[0]}
                packId={a.autoTopUp?.packId ?? CREDIT_PACKS[0].id}
                thresholds={TOP_UP_THRESHOLDS}
                packs={CREDIT_PACKS.map((p) => ({ id: p.id, label: p.label, priceCents: p.priceCents, creditCents: packCreditCents(p) }))}
              />
            </>
          ) : (
            <p className="mt-1 text-xs text-muted">Buy a pack once: your card is saved securely by Stripe, then you can turn on automatic top-up here.</p>
          )}
        </>
      )}

      <h3 className="mt-8 font-semibold">API keys</h3>
      <p className="mt-1 text-xs text-muted">
        Send a key as <code>Authorization: Bearer spz_live_…</code>. We only store a fingerprint of each key: if you lose one, revoke it and
        create a new one.
      </p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              {["Name", "Key", "Created", "Last used", ""].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {active.map((k) => (
              <tr key={k.keyId}>
                <td className="px-4 py-2">{k.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{k.hint}</td>
                <td className="px-4 py-2 tabular-nums">{date(k.createdAt)}</td>
                <td className="px-4 py-2 tabular-nums">
                  {date(k.lastUsedAt)}
                  {k.lastUsedIp ? ` · ${k.lastUsedIp}` : ""}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={revokeKeyAction}>
                    <input type="hidden" name="accountId" value={a.id} />
                    <input type="hidden" name="keyId" value={k.keyId} />
                    <button className="text-red-700 underline dark:text-red-300">Revoke</button>
                  </form>
                </td>
              </tr>
            ))}
            {!active.length && (
              <tr>
                <td className="px-4 py-4 text-muted" colSpan={5}>
                  No active key.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {a.status === "active" && <NewKeyForm accountId={a.id} />}

      <h3 className="mt-8 font-semibold">Webhook</h3>
      <p className="mt-1 text-xs text-muted">
        We POST <code>report.done</code> and <code>report.failed</code> here when a Deep Report ends, signed with the secret below
        (header <code>Spamlyze-Signature</code>).
      </p>
      <WebhookForm accountId={a.id} url={a.webhookUrl ?? null} />
      {a.webhookSecret && (
        <p className="mt-2 text-xs text-muted">
          Signing secret: <code className="break-all font-mono">{a.webhookSecret}</code>
        </p>
      )}

      <h3 className="mt-8 font-semibold">Recent activity</h3>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              {["Date (UTC)", "What", "Amount", "Balance"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ledger.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2">{date(e.createdAt)}</td>
                <td className="px-4 py-2">{what(e.type, e.reason)}</td>
                <td className={`px-4 py-2 ${e.cents > 0 ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{usd(e.cents)}</td>
                <td className="px-4 py-2">{usd(e.balanceAfter)}</td>
              </tr>
            ))}
            {!ledger.length && (
              <tr>
                <td className="px-4 py-4 text-muted" colSpan={4}>
                  Nothing yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Full history: <code>GET {site.url}/v1/ledger</code>.
      </p>
    </section>
  );
}
