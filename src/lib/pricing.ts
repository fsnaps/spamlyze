// Deep Report pricing, with an optional time-boxed promo (e.g. Black Friday).
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

export const regularPriceCents = () => Number(process.env.DEEP_REPORT_PRICE_CENTS ?? 4900);

/** Promo settings from the environment, or null when none is configured. */
export function promoSchedule() {
  const percentOff = Number(process.env.PROMO_PERCENT_OFF ?? 0);
  const startsAt = Date.parse(process.env.PROMO_STARTS_AT ?? "");
  const endsAt = Date.parse(process.env.PROMO_ENDS_AT ?? "");
  if (!(percentOff > 0 && percentOff < 100) || Number.isNaN(startsAt) || Number.isNaN(endsAt)) return null;
  return { label: process.env.PROMO_LABEL || "Sale", percentOff, startsAt, endsAt };
}

export function deepPricing(now: number = Date.now()): DeepPricing {
  const regularCents = regularPriceCents();
  const s = promoSchedule();
  if (!s || now < s.startsAt || now >= s.endsAt) return { regularCents, cents: regularCents, promo: null };
  // Round down to a whole dollar: $49 at -40% is $29, never less than the advertised discount.
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
