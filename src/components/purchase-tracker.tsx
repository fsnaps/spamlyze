"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/** Sends one GA "purchase" event after Stripe redirects back. GA dedupes on transaction_id. */
export function PurchaseTracker({ id, value }: { id: string; value: number }) {
  useEffect(() => {
    // gtag may load a moment after the page when consent was given earlier.
    const timer = setTimeout(() => {
      trackEvent("purchase", {
        transaction_id: id,
        currency: "USD",
        value,
        items: [{ item_id: "deep_report", item_name: "Deep Report", price: value, quantity: 1 }],
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [id, value]);
  return null;
}
