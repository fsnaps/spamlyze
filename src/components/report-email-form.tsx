"use client";

import { useActionState, useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { emailQuickReport, type ReportEmailState } from "@/app/actions";

const initialState: ReportEmailState = { status: "idle", message: "" };

/** Optional email capture under a Quick Check: the report stays fully visible without it. */
export function ReportEmailForm({ checkId, domain }: { checkId: string; domain: string }) {
  const [state, formAction, pending] = useActionState(emailQuickReport, initialState);

  useEffect(() => {
    if (state.status === "success") trackEvent("sign_up", { method: "quick_check_email" });
  }, [state.status]);

  return (
    <section className="mt-12 rounded-2xl border border-line bg-surface p-6 print:hidden">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="sm:max-w-sm">
          <h2 className="text-xl font-semibold">Keep this report</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li className="flex gap-2">
              <span aria-hidden className="text-accent">✓</span>
              <span>Get the full report for {domain} in your inbox, with every signal and fix.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-accent">✓</span>
              <span>Get an alert when Google rolls out a spam update, so you can check again in a minute.</span>
            </li>
          </ul>
        </div>
        <div className="w-full sm:max-w-xs">
          {state.status === "success" ? (
            <p
              role="status"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
            >
              {state.message}
            </p>
          ) : (
            <form action={formAction} className="flex flex-col gap-3">
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
                className="h-12 w-full min-w-0 rounded-xl border border-line bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
              <button
                type="submit"
                disabled={pending}
                className="h-12 rounded-xl bg-foreground px-6 font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Sending…" : "Email me the report"}
              </button>
              <p aria-live="polite" className="min-h-0 text-sm text-red-600 empty:hidden dark:text-red-400">
                {state.status === "error" ? state.message : ""}
              </p>
              <p className="text-xs text-muted">
                Optional. No spam, unsubscribe in one click.{" "}
                <a href="/privacy" className="underline">
                  Privacy
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
