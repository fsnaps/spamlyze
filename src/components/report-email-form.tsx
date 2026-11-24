"use client";

import { useActionState, useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { emailQuickReport, type ReportEmailState } from "@/app/actions";

const initialState: ReportEmailState = { status: "idle", message: "" };

/**
 * The email gate under the top 3 issues: quiet on purpose, the Deep Report is the main action. Sending it sets a cookie, so the server
 * re-renders the page unlocked in the same round trip; this component stays mounted to show the
 * confirmation.
 */
export function ReportEmailForm({
  checkId,
  unlocked,
  issues,
  flagged,
}: {
  checkId: string;
  unlocked: boolean;
  issues: number;
  /** Spam signals rated moderate or high, teased while locked. */
  flagged: number;
}) {
  const [state, formAction, pending] = useActionState(emailQuickReport, initialState);

  useEffect(() => {
    if (state.status === "success") trackEvent("sign_up", { method: "quick_check_email" });
  }, [state.status]);

  if (state.status === "success") {
    return (
      <p
        role="status"
        className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-800 print:hidden dark:text-emerald-300"
      >
        {state.message}
      </p>
    );
  }
  if (unlocked) return null;

  const rest = issues - 1;
  return (
    <section id="unlock" className="mt-6 scroll-mt-24 rounded-xl bg-background p-5 sm:p-6 print:hidden">
      <h3 className="font-semibold">
        See {rest > 0 ? `the other ${rest === 1 ? "issue" : `${rest} issues`} and ` : ""}your 5 signal ratings, free
      </h3>
      <p className="mt-1 text-sm text-muted">
        We&apos;ll show them here, email you a copy
        {flagged > 0 ? ` (${flagged} of 5 signals need attention)` : ""}, and warn you when Google ships its next spam update.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="checkId" value={checkId} />
        <div aria-hidden="true" className="hidden">
          <label>
            Company
            <input type="text" name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <label className="sr-only" htmlFor="report-email">
          Email
        </label>
        <input
          id="report-email"
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          autoComplete="email"
          className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-4 text-base outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10 sm:flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 shrink-0 rounded-lg border border-line bg-surface px-5 text-sm font-semibold transition hover:border-foreground/40 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Show me"}
        </button>
      </form>
      <p aria-live="polite" className="mt-2 text-sm text-red-600 empty:hidden dark:text-red-400">
        {state.status === "error" ? state.message : ""}
      </p>
      <p className="mt-3 text-xs text-muted">
        No newsletter. Unsubscribe in one click.{" "}
        <a href="/privacy" className="underline underline-offset-2">
          Privacy
        </a>
      </p>
    </section>
  );
}

/** Stand-in lines under a locked item. Placeholder text only: the real content isn't sent to the browser. */
export function LockedLines({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden className="mt-2 space-y-1.5 select-none blur-[5px]">
      {Array.from({ length: lines }, (_, i) => (
        <p key={i} className="text-sm text-muted">
          {i % 2 ? "Fix: rewrite the affected pages and keep only what serves visitors." : "Several sampled pages show this pattern across the site."}
        </p>
      ))}
    </div>
  );
}

/** Stand-in for a signal's rating while locked: a blurred pill, no icon. */
export function LockedBadge() {
  return (
    <span aria-label="Rating hidden" className="select-none rounded-full bg-stone-500/10 px-2.5 py-0.5 text-xs font-semibold text-muted">
      <span aria-hidden className="blur-[3px]">Moderate</span>
    </span>
  );
}
