// Read at build time on static pages: set DEEP_REPORT_ENABLED with BUILD availability.
export const deepReportEnabled = () => process.env.DEEP_REPORT_ENABLED === "true";

export const deepReportPrice = () => `$${Math.round(Number(process.env.DEEP_REPORT_PRICE_CENTS ?? 4900) / 100)}`;
