import { Suspense } from "react";
import { DeepCheckout } from "@/components/deep-checkout";
import { PromoCountdown } from "@/components/promo-countdown";
import { deepReportRegularPrice, deepTiersNow } from "@/lib/deep/config";
import { formatUsd, LARGE_TIER_MAX_PAGES, promoLastDay, SMALL_TIER_MAX_PAGES, type DeepPricing } from "@/lib/pricing";

// The Deep Report price depends on the site's size (two tiers) and on the clock (time-boxed
// promos), so each piece below is rendered at request time inside Suspense. The fallback is
// the regular price, which the rest of the page can keep prerendered.

/** "from $19", or "from $19 $14" with the regular price struck through during a promo. */
export function DeepPriceText() {
  return (
    <Suspense fallback={`from ${deepReportRegularPrice("small")}`}>
      <PriceText />
    </Suspense>
  );
}

async function PriceText() {
  const { small } = await deepTiersNow();
  if (!small.promo) return `from ${formatUsd(small.cents)}`;
  return (
    <>
      from <s className="opacity-60">{formatUsd(small.regularCents)}</s> {formatUsd(small.cents)}
    </>
  );
}

function TierRow({ pages, p }: { pages: number; p: DeepPricing }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-base text-muted">Up to {pages} pages</span>
      <span className="flex items-baseline gap-2 whitespace-nowrap text-2xl font-semibold">
        {p.promo && <s className="text-base font-normal text-muted">{formatUsd(p.regularCents)}</s>}
        {formatUsd(p.cents)}
      </span>
    </div>
  );
}

/** Prices of both tiers on the plan card, with the promo badge and its last day. */
export function DeepPriceLarge() {
  const fallback = (
    <div className="mt-2 space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base text-muted">Up to {SMALL_TIER_MAX_PAGES} pages</span>
        <span className="text-2xl font-semibold">{deepReportRegularPrice("small")}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base text-muted">Up to {LARGE_TIER_MAX_PAGES} pages</span>
        <span className="text-2xl font-semibold">{deepReportRegularPrice("large")}</span>
      </div>
    </div>
  );
  return (
    <Suspense fallback={fallback}>
      <PriceLarge />
    </Suspense>
  );
}

async function PriceLarge() {
  const { small, large } = await deepTiersNow();
  return (
    <div className="mt-2">
      <div className="space-y-1">
        <TierRow pages={SMALL_TIER_MAX_PAGES} p={small} />
        <TierRow pages={LARGE_TIER_MAX_PAGES} p={large} />
      </div>
      <p className="mt-2 text-sm text-muted">One-time payment. We count your pages before checkout.</p>
      {small.promo && (
        <p className="mt-2 inline-flex rounded-full bg-accent/10 px-2.5 py-0.5 text-sm font-medium text-accent">
          {small.promo.label} -{small.promo.percentOff}% until {promoLastDay(small.promo.endsAt)}
        </p>
      )}
    </div>
  );
}

/** Checkout form for a site we don't know yet: priced by size once we've counted its pages. */
export function DeepCheckoutNow({ url }: { url?: string }) {
  return (
    <Suspense
      fallback={
        <DeepCheckout
          url={url}
          price={`from ${deepReportRegularPrice("small")}`}
          largeOption={{ pages: LARGE_TIER_MAX_PAGES, price: deepReportRegularPrice("large") }}
        />
      }
    >
      <CheckoutNow url={url} />
    </Suspense>
  );
}

async function CheckoutNow({ url }: { url?: string }) {
  const { small, large } = await deepTiersNow();
  return (
    <DeepCheckout
      url={url}
      price={`from ${formatUsd(small.cents)}`}
      largeOption={{ pages: LARGE_TIER_MAX_PAGES, price: formatUsd(large.cents) }}
    />
  );
}

/** Thin bar announcing the promo, rendered only while it runs. */
export function PromoBanner() {
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  );
}

async function Banner() {
  const { small } = await deepTiersNow();
  if (!small.promo) return null;
  const lastDay = promoLastDay(small.promo.endsAt);
  return (
    <div className="bg-accent text-white">
      <a
        href="#deep-report"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm sm:px-6"
      >
        <span className="font-semibold">
          {small.promo.label}: -{small.promo.percentOff}% on the Deep Report
        </span>
        <span>
          from <s className="opacity-75">{formatUsd(small.regularCents)}</s> {formatUsd(small.cents)} until {lastDay}
        </span>
        <span className="rounded-full bg-white/15 px-2 py-0.5 font-medium tabular-nums">
          <PromoCountdown endsAt={small.promo.endsAt} fallback={`Ends ${lastDay}`} />
        </span>
        <span className="font-semibold underline underline-offset-4">Get it →</span>
      </a>
    </div>
  );
}
