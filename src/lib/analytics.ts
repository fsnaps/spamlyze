// Client-side helpers for Google Analytics. GA only loads after the visitor accepts (see components/analytics.tsx).

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
export const CONSENT_KEY = "sl-consent";
export const CONSENT_EVENT = "sl-consent-open";

export type Consent = "granted" | "denied";

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {}
}

/** Sends a GA event. A no-op until the visitor has accepted analytics. */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  window.gtag?.("event", name, params);
}

/** Reopens the cookie banner (footer link). */
export function openConsent() {
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
