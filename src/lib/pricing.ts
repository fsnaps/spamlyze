// Deep Report pricing by site size, with an optional time-boxed promo (e.g. Black Friday).
// Two tiers: "small" analyzes up to SMALL_TIER_MAX_PAGES pages, "large" up to 500.
// The promo is driven by dates: it switches on and off by itself, no redeploy needed.
// No "server-only": the types and formatters are shared with client components.

export type DeepPromo = {
  label: string;
  percentOff: number;
  /** ISO date, exclusive: the promo stops at this instant. */
  endsAt: string;
};

export type DeepPricing = {
  regularCents: number;
  /** What the buyer pays right now. */
  cents: number;
  promo: DeepPromo | null;
};

export type DeepTier = "small" | "large";

/** Pages analyzed per tier, homepage included. */
export const SMALL_TIER_MAX_PAGES = 100;
export const LARGE_TIER_MAX_PAGES = 500;
export const tierMaxPages = (tier: DeepTier) => (tier === "small" ? SMALL_TIER_MAX_PAGES : LARGE_TIER_MAX_PAGES);

/**
 * Picks the tier from the number of URLs in the sitemap (homepage counted on top).
 * Without a sitemap we can't count: the small tier, unless the buyer asked for the large one.
 * A buyer can always pick the large tier, never the small one for a site that is too big.
 */
export function tierFor(sitemapUrlCount: number | null | undefined, wantsLarge = false): DeepTier {
  if (wantsLarge) return "large";
  if (typeof sitemapUrlCount === "number" && sitemapUrlCount + 1 > SMALL_TIER_MAX_PAGES) return "large";
  return "small";
}

export const regularPriceCents = (tier: DeepTier = "large") =>
  tier === "small"
    ? Number(process.env.DEEP_REPORT_SMALL_PRICE_CENTS ?? 1900)
    : Number(process.env.DEEP_REPORT_PRICE_CENTS ?? 3900);

/** Promo settings from the environment, or null when none is configured. */
export function promoSchedule() {
  const percentOff = Number(process.env.PROMO_PERCENT_OFF ?? 0);
  const startsAt = Date.parse(process.env.PROMO_STARTS_AT ?? "");
  const endsAt = Date.parse(process.env.PROMO_ENDS_AT ?? "");
  if (!(percentOff > 0 && percentOff < 100) || Number.isNaN(startsAt) || Number.isNaN(endsAt)) return null;
  return { label: process.env.PROMO_LABEL || "Sale", percentOff, startsAt, endsAt };
}

export function deepPricing(now: number = Date.now(), tier: DeepTier = "large"): DeepPricing {
  const regularCents = regularPriceCents(tier);
  const s = promoSchedule();
  if (!s || now < s.startsAt || now >= s.endsAt) return { regularCents, cents: regularCents, promo: null };
  // Round down to a whole dollar: $39 at -25% is $29 and $19 is $14, never less than the advertised discount.
  const cents = Math.floor((regularCents * (100 - s.percentOff)) / 100 / 100) * 100;
  return {
    regularCents,
    cents,
    promo: { label: s.label, percentOff: s.percentOff, endsAt: new Date(s.endsAt).toISOString() },
  };
}

export const formatUsd = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

/** Last day of the promo, e.g. "Nov 30", in Brussels time. */
export const promoLastDay = (endsAt: string) =>
  new Date(Date.parse(endsAt) - 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Europe/Brussels",
  });
