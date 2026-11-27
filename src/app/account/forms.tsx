"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createKeyAction, setAutoTopUpAction, setWebhookAction, type AutoTopUpState, type NewKeyState, type WebhookState } from "./actions";

/** Starts a Stripe Checkout for a credit pack and sends the buyer to Stripe. */
export function BuyCreditsForm({ accountId, packId }: { accountId: string; packId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function buy() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/credits/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, packId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else {
        setError(data.error ?? "Something went wrong.");
        setPending(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }
  return (
    <div className="mt-3">
      <button
        onClick={buy}
        disabled={pending}
        className="w-full rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Redirecting…" : "Buy"}
      </button>
      {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}

/** Creates a key and shows it once: only its hash is stored. */
export function NewKeyForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState<NewKeyState, FormData>(createKeyAction, { key: null, error: null });
  return (
    <form action={action} className="mt-3 text-sm">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="flex flex-wrap items-center gap-2">
        <input name="name" placeholder="Key name (e.g. production)" maxLength={60} className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-1" />
        <button disabled={pending} className="rounded border border-line px-3 py-1 disabled:opacity-50">
          {pending ? "Creating…" : "Create key"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{state.error}</p>}
      {state.key && (
        <div className="mt-3 rounded-xl border border-amber-500/60 bg-amber-500/10 p-3">
          <p className="font-medium">Copy your key now: it won&apos;t be shown again.</p>
          <div className="mt-2 flex items-start gap-2">
            <code className="block min-w-0 flex-1 break-all rounded bg-surface px-2 py-1 font-mono text-xs" data-testid="new-key">
              {state.key}
            </code>
            <CopyButton value={state.key} label="Copy key" />
          </div>
        </div>
      )}
    </form>
  );
}

export function WebhookForm({ accountId, url }: { accountId: string; url: string | null }) {
  const [state, action, pending] = useActionState<WebhookState, FormData>(setWebhookAction, { error: null, saved: false });
  return (
    <form action={action} className="mt-3 text-sm">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="url"
          type="url"
          defaultValue={url ?? ""}
          placeholder="https://example.com/hooks/spamlyze"
          className="min-w-0 flex-1 rounded border border-line bg-transparent px-2 py-1"
        />
        <button disabled={pending} className="rounded border border-line px-3 py-1 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Leave empty and save to stop webhooks.</p>
      {state.error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{state.error}</p>}
      {state.saved && !state.error && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Saved.</p>}
    </form>
  );
}

export function AutoTopUpForm(props: {
  accountId: string;
  enabled: boolean;
  thresholdCents: number;
  packId: string;
  thresholds: number[];
  packs: { id: string; label: string; priceCents: number; creditCents: number }[];
}) {
  const [state, action, pending] = useActionState<AutoTopUpState, FormData>(setAutoTopUpAction, { error: null, saved: false });
  const usd = (c: number) => `$${(c / 100).toFixed(0)}`;
  return (
    <form action={action} className="mt-3 text-sm">
      <input type="hidden" name="accountId" value={props.accountId} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="enabled" defaultChecked={props.enabled} />
          When my balance falls under
        </label>
        <select name="threshold" defaultValue={props.thresholdCents} className="rounded border border-line bg-transparent px-2 py-1">
          {props.thresholds.map((t) => (
            <option key={t} value={t}>
              {usd(t)}
            </option>
          ))}
        </select>
        <span>buy</span>
        <select name="packId" defaultValue={props.packId} className="rounded border border-line bg-transparent px-2 py-1">
          {props.packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}: {usd(p.priceCents)} ({usd(p.creditCents)} of credits)
            </option>
          ))}
        </select>
        <button disabled={pending} className="rounded border border-line px-3 py-1 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{state.error}</p>}
      {state.saved && !state.error && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Saved.</p>}
    </form>
  );
}

/** Small copy-to-clipboard button with a "Copied" confirmation. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-xs hover:border-foreground/40"
    >
      {copied ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
