import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key);
  return client;
}

/** Deep Report price in cents (USD). */
export const DEEP_REPORT_PRICE_CENTS = Number(process.env.DEEP_REPORT_PRICE_CENTS ?? 4900);
