"use client";

import { useActionState, useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { joinWaitlist, type WaitlistState } from "@/app/actions";

const initialState: WaitlistState = { status: "idle", message: "" };

export function WaitlistForm({
  source,
  site,
  compact = false,
  cta = "Get early access",
}: {
  source: string;
  site?: string;
  compact?: boolean;
  cta?: string;
}) {
  const [state, formAction, pending] = useActionState(joinWaitlist, initialState);

  useEffect(() => {
    if (state.status === "success") trackEvent("sign_up", { method: source });
  }, [state.status, source]);

  if (state.status === "success") {
    return (
      <p
        role="status"
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <input type="hidden" name="source" value={source} />
      <div aria-hidden="true" className="hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className={compact ? "flex flex-col gap-3" : "flex flex-col gap-3 sm:flex-row"}>
        <label className="sr-only" htmlFor={`email-${source}`}>
          Email
        </label>
        <input
          id={`email-${source}`}
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          autoComplete="email"
          className={`h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 ${compact ? "" : "sm:flex-1"}`}
        />
        {site || compact ? (
          <input type="hidden" name="site" value={site ?? ""} />
        ) : (
          <>
            <label className="sr-only" htmlFor={`site-${source}`}>
              Your website (optional)
            </label>
            <input
              id={`site-${source}`}
              name="site"
              type="text"
              inputMode="url"
              placeholder="yoursite.com (optional)"
              className="h-12 w-full min-w-0 sm:flex-1 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </>
        )}
        <button
          type="submit"
          disabled={pending}
          className="h-12 shrink-0 rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Joining…" : cta}
        </button>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-red-600 dark:text-red-400">
        {state.status === "error" ? state.message : ""}
      </p>
    </form>
  );
}
