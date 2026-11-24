import "server-only";

// Prepaid credit packs sold through Stripe. Bonus credits reward larger top-ups: the customer
// pays `priceCents` and the balance goes up by `priceCents + bonusCents`.
export type CreditPack = {
  id: string;
  priceCents: number;
  bonusCents: number;
  label: string;
};

export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", priceCents: 5_000, bonusCents: 0, label: "Starter" },
  { id: "growth", priceCents: 20_000, bonusCents: 2_000, label: "Growth" },
  { id: "scale", priceCents: 50_000, bonusCents: 10_000, label: "Scale" },
];

export const getPack = (id: unknown): CreditPack | undefined =>
  typeof id === "string" ? CREDIT_PACKS.find((p) => p.id === id) : undefined;

/** Total credits added to the balance for a pack (price + bonus). */
export const packCreditCents = (p: CreditPack) => p.priceCents + p.bonusCents;

/** Balances under which an automatic top-up can be set to trigger, in cents. */
export const TOP_UP_THRESHOLDS = [1_200, 2_500, 5_000, 10_000];
