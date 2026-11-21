"use client";

import { useActionState, useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { emailQuickReport, type ReportEmailState } from "@/app/actions";

const initialState: ReportEmailState = { status: "idle", message: "" };

/**
 * The email gate right under the Quick Check score. Sending it sets a cookie, so the server
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
        className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-800 print:hidden dark:text-emerald-300"
      >
        {state.message}
      </p>
    );
  }
  if (unlocked) return null;

  return (
    <section
      id="unlock"
      className="sl-fade-up mt-4 scroll-mt-8 rounded-2xl border-2 border-accent bg-surface p-5 [animation-delay:200ms] sm:p-6 print:hidden"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">Unlock your detailed Quick Check</h2>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          Free
        </span>
      </div>
      <p className="mt-2 text-muted">
        You&apos;re seeing 1 of the {issues} issues we found
        {flagged > 0 ? `, and ${flagged} of 5 spam signals need attention` : ""}. Enter your email to see them all
        here and get a copy in your inbox.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-3">
        {["All 3 issues with their fixes", "The rating of each spam signal", "An alert at the next Google spam update"].map(
          (t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="text-accent">
                ✓
              </span>
              <span>{t}</span>
            </li>
          ),
        )}
      </ul>
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
          className="h-12 w-full min-w-0 rounded-xl border border-line bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 sm:flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 shrink-0 rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Unlocking…" : "Unlock for free"}
        </button>
      </form>
      <p aria-live="polite" className="mt-2 text-sm text-red-600 empty:hidden dark:text-red-400">
        {state.status === "error" ? state.message : ""}
      </p>
      <p className="mt-2 text-xs text-muted">
        No spam: the report, then an email only when Google ships a spam update. Unsubscribe in one click.{" "}
        <a href="/privacy" className="underline">
          Privacy
        </a>
      </p>
    </section>
  );
}

/** Stand-in lines under a locked item. Placeholder text only: the real content isn't sent to the browser. */
export function LockedLines({ lines = 2 }: { lines?: number }) {
  return (
    <div aria-hidden className="mt-3 space-y-2 select-none blur-[5px]">
      {Array.from({ length: lines }, (_, i) => (
        <p key={i} className="text-sm text-muted">
          {i % 2 ? "Fix: rewrite the affected pages and keep only what serves visitors." : "Several sampled pages show this pattern across the site."}
        </p>
      ))}
    </div>
  );
}

export function UnlockLink() {
  return (
    <a href="#unlock" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline underline-offset-4">
      <span aria-hidden>🔒</span> Unlock with your email, free
    </a>
  );
}
