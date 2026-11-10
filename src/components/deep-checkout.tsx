"use client";

import { useState } from "react";

/** Starts a Stripe Checkout for the Deep Report. With `url`, the site is already known. */
export function DeepCheckout({ url, price }: { url?: string; price: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = url ?? String(new FormData(event.currentTarget).get("url") ?? "");
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/deep/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("We couldn't reach our server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
      {!url && (
        <>
          <label className="sr-only" htmlFor="deep-url">
            Website address
          </label>
          <input
            id="deep-url"
            name="url"
            type="text"
            inputMode="url"
            required
            placeholder="yoursite.com"
            className="h-12 w-full min-w-0 rounded-xl border border-line bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Opening secure checkout…" : `Get the Deep Report · ${price}`}
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    </form>
  );
}
