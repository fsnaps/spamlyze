"use client";

import { useEffect, useState } from "react";
import { CONSENT_EVENT, GA_ID, readConsent, saveConsent, type Consent } from "@/lib/analytics";

const COOKIE_DOMAINS = () => {
  const host = window.location.hostname;
  return [host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
};

/** Loads gtag.js once, only after consent (GA basic consent mode: nothing is sent before). */
function loadGa() {
  if (!GA_ID || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

/** Withdrawing consent: stop sending and delete GA cookies. */
function stopGa() {
  if (GA_ID) (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true;
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;
    for (const domain of COOKIE_DOMAINS()) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
    }
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

export function Analytics() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!GA_ID) return;
    const consent = readConsent();
    if (consent === "granted") loadGa();
    // Show the banner after mount, so the server HTML stays the same for everyone.
    const timer = setTimeout(() => setOpen(consent === null), 0);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_EVENT, reopen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(CONSENT_EVENT, reopen);
    };
  }, []);

  if (!GA_ID || !open) return null;

  const choose = (value: Consent) => {
    saveConsent(value);
    if (value === "granted") {
      if (GA_ID) (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = false;
      loadGa();
      window.gtag?.("consent", "update", { analytics_storage: "granted" });
    } else {
      stopGa();
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="sl-fade-up fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-surface p-5 shadow-lg print:hidden"
    >
      <p className="text-sm leading-relaxed">
        We&apos;d like to use Google Analytics to see how visitors use Spamlyze. It sets cookies only if you agree. See
        our{" "}
        <a href="/privacy#cookies" className="text-accent underline">
          privacy policy
        </a>
        .
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => choose("denied")}
          className="h-10 flex-1 rounded-xl border border-line px-4 text-sm font-semibold hover:border-accent"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose("granted")}
          className="h-10 flex-1 rounded-xl border border-line px-4 text-sm font-semibold hover:border-accent"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_EVENT))}
      className="hover:text-foreground"
    >
      Cookies
    </button>
  );
}
