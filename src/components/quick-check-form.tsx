"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

const STEPS = [
  "Reading robots.txt and your sitemap…",
  "Fetching a sample of your pages…",
  "Measuring thin, duplicate and link-heavy pages…",
  "Comparing the sample with Google's spam policies…",
  "Writing your report…",
];

async function captchaToken(): Promise<string | undefined> {
  if (!SITE_KEY || !window.grecaptcha) return undefined;
  return new Promise((resolve) => {
    window.grecaptcha!.ready(() => {
      window.grecaptcha!.execute(SITE_KEY, { action: "quick_check" }).then(resolve, () => resolve(undefined));
    });
  });
}

export function QuickCheckForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(timer);
  }, [pending]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("url") ?? "");
    setError("");
    setStep(0);
    setPending(true);
    try {
      const token = await captchaToken();
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, token }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (data.id) {
        router.push(`/report/${data.id}`);
        return;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("We couldn't reach our server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <>
      {SITE_KEY && <Script src={`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`} strategy="afterInteractive" />}
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="check-url">
          Website address
        </label>
        <input
          id="check-url"
          name="url"
          type="text"
          inputMode="url"
          required
          disabled={pending}
          placeholder="yoursite.com"
          className="h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 sm:flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 shrink-0 rounded-xl bg-accent px-6 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Checking…" : "Check my site"}
        </button>
      </form>
      <div aria-live="polite" className="mt-3 min-h-6 text-sm">
        {pending && <p className="text-muted">{STEPS[step]} This takes about 30 seconds.</p>}
        {!pending && error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      </div>
      {SITE_KEY && (
        <p className="mt-2 text-xs text-muted">
          Protected by reCAPTCHA. Google&apos;s{" "}
          <a className="underline" href="https://policies.google.com/privacy">Privacy Policy</a> and{" "}
          <a className="underline" href="https://policies.google.com/terms">Terms</a> apply.
        </p>
      )}
    </>
  );
}
