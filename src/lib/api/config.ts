import "server-only";

/**
 * Public API settings. The API stays closed to the public until API_ENABLED is "true";
 * accounts flagged `beta` can use it before that, to test in production.
 */
export const apiEnabled = () => process.env.API_ENABLED === "true";

/** Prices in US cents, charged from the prepaid balance. */
export const API_PRICES = {
  quickCheck: Number(process.env.API_QUICK_CHECK_CENTS ?? 15),
  deepReport: Number(process.env.API_DEEP_REPORT_CENTS ?? 1200),
};

/** Default cap on what one account may spend per UTC day, in cents. */
export const DEFAULT_DAILY_SPEND_CAP_CENTS = Number(process.env.API_DAILY_SPEND_CAP_CENTS ?? 10_000);
