"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScanProgress } from "./scan-progress";

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

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
  const [host, setHost] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("url") ?? "");
    setError("");
    setDone(false);
    setHost(
      url
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .toLowerCase(),
    );
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
        setDone(true);
        router.prefetch(`/report/${data.id}`);
        await new Promise((r) => setTimeout(r, 700));
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
      {SITE_KEY && (
        <Script src={`https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`} strategy="afterInteractive" />
      )}
      {pending ? (
        <ScanProgress host={host} done={done} />
      ) : (
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
      )}
      <div aria-live="polite" className="mt-3 min-h-6 text-sm">
        {!pending && error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      </div>
      {SITE_KEY && (
        <p className="mt-2 text-xs text-muted">
          Protected by reCAPTCHA. Google&apos;s{" "}
          <a className="underline" href="https://policies.google.com/privacy">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a className="underline" href="https://policies.google.com/terms">
            Terms
          </a>{" "}
          apply.
        </p>
      )}
    </>
  );
}
