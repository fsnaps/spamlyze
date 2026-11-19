import { connection } from "next/server";
import { deepPricing, formatUsd, regularPriceCents, type DeepTier } from "@/lib/pricing";

// Read at build time on static pages: set DEEP_REPORT_ENABLED with BUILD availability.
export const deepReportEnabled = () => process.env.DEEP_REPORT_ENABLED === "true";

/** Regular price, safe in prerendered output (no clock involved). */
export const deepReportRegularPrice = (tier: DeepTier = "small") => formatUsd(regularPriceCents(tier));

/** Price at request time, promo included. Opts the caller out of prerendering: wrap it in Suspense. */
export async function deepPricingNow(tier: DeepTier = "small") {
  await connection();
  return deepPricing(Date.now(), tier);
}

/** Both tiers at request time. */
export async function deepTiersNow() {
  await connection();
  const now = Date.now();
  return { small: deepPricing(now, "small"), large: deepPricing(now, "large") };
}
