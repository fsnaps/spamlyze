"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { SMALL_TIER_MAX_PAGES } from "@/lib/pricing";

/**
 * Starts a Stripe Checkout for the Deep Report. With `url`, the site is already known.
 * The server counts the site's pages and picks the size tier; `largeOption` lets the buyer
 * ask for the large tier when we can't count (no sitemap).
 */
export function DeepCheckout({
  url,
  price,
  largeOption,
}: {
  url?: string;
  price: string;
  largeOption?: { pages: number; price: string };
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = url ?? String(form.get("url") ?? "");
    const large = form.get("large") === "on";
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/deep/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target, large }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; cents?: number; error?: string };
      if (data.url) {
        trackEvent("begin_checkout", { currency: "USD", value: (data.cents ?? 0) / 100 });
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
      {largeOption && (
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" name="large" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
          <span>
            My site has over {SMALL_TIER_MAX_PAGES} pages: analyze up to {largeOption.pages} ({largeOption.price}). We pick this for you
            when your sitemap shows it.
          </span>
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Counting your pages…" : `Get the Deep Report · ${price}`}
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    </form>
  );
}
