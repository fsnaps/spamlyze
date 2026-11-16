import { connection } from "next/server";
import { deepPricing, formatUsd, regularPriceCents } from "@/lib/pricing";

// Read at build time on static pages: set DEEP_REPORT_ENABLED with BUILD availability.
export const deepReportEnabled = () => process.env.DEEP_REPORT_ENABLED === "true";

/** Regular price, safe in prerendered output (no clock involved). */
export const deepReportRegularPrice = () => formatUsd(regularPriceCents());

/** Price at request time, promo included. Opts the caller out of prerendering: wrap it in Suspense. */
export async function deepPricingNow() {
  await connection();
  return deepPricing();
}
