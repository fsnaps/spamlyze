"use client";

import { useActionState } from "react";
import { requestDeepAccess, setDeepPrivacy, type AccessState } from "@/app/deep/[id]/actions";

/** Sharing setting at the top of a finished Deep Report. */
export function DeepPrivacyToggle({ id, isPrivate, masked }: { id: string; isPrivate: boolean; masked: string }) {
  return (
    <form
      action={setDeepPrivacy.bind(null, id, !isPrivate)}
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between print:hidden"
    >
      <p className="text-muted">
        <span aria-hidden>{isPrivate ? "🔒" : "🔗"}</span>{" "}
        {isPrivate ? (
          <>
            <span className="font-semibold text-foreground">Private.</span> Opens only in this browser, or after signing
            in with the purchase email ({masked}).
          </>
        ) : (
          <>
            <span className="font-semibold text-foreground">Anyone with the link</span> can view this report.
          </>
        )}
      </p>
      <button
        type="submit"
        className="shrink-0 rounded-full border border-line px-4 py-1.5 font-semibold transition hover:border-accent hover:text-accent"
      >
        {isPrivate ? "Share with link again" : "Make private"}
      </button>
    </form>
  );
}

const idle: AccessState = { status: "idle", message: "" };

/** Shown instead of a private report: asks for the purchase email and sends a sign-in link. */
export function DeepPrivateGate({ id, masked, expired }: { id: string; masked: string; expired: boolean }) {
  const [state, action, pending] = useActionState(requestDeepAccess.bind(null, id), idle);
  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <p aria-hidden className="text-3xl">
        🔒
      </p>
      <h2 className="mt-3 text-xl font-semibold">This report is private</h2>
      <p className="mt-2 text-muted">
        Its owner made it private. Enter the email used to buy it ({masked}) and we&apos;ll send you a sign-in link.
      </p>
      {expired && state.status === "idle" && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">That sign-in link has expired. Ask for a new one below.</p>
      )}
      {state.status === "sent" ? (
        <p
          role="status"
          className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
        >
          {state.message}
        </p>
      ) : (
        <form action={action} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="deep-access-email">
            Email
          </label>
          <input
            id="deep-access-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="h-12 w-full min-w-0 rounded-xl border border-line bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 sm:flex-1"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-12 shrink-0 rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send me a link"}
          </button>
        </form>
      )}
      {state.status === "error" && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.message}</p>}
    </div>
  );
}
