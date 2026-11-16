import { Suspense } from "react";
import { DeepCheckout } from "@/components/deep-checkout";
import { PromoCountdown } from "@/components/promo-countdown";
import { deepPricingNow, deepReportRegularPrice } from "@/lib/deep/config";
import { formatUsd, promoLastDay } from "@/lib/pricing";

// The Deep Report price depends on the clock (time-boxed promos), so each piece below is
// rendered at request time inside Suspense. The fallback is the regular price, which the
// rest of the page can keep prerendered.

/** "$49", or "$49 $29" with the regular price struck through during a promo. */
export function DeepPriceText() {
  return (
    <Suspense fallback={deepReportRegularPrice()}>
      <PriceText />
    </Suspense>
  );
}

async function PriceText() {
  const p = await deepPricingNow();
  if (!p.promo) return formatUsd(p.cents);
  return (
    <>
      <s className="opacity-60">{formatUsd(p.regularCents)}</s> {formatUsd(p.cents)}
    </>
  );
}

/** Big price on the plan card, with the promo badge and its last day. */
export function DeepPriceLarge() {
  const regular = (
    <p className="mt-1 text-3xl font-semibold">
      {deepReportRegularPrice()} <span className="text-base font-normal text-muted">· one-time</span>
    </p>
  );
  return (
    <Suspense fallback={regular}>
      <PriceLarge />
    </Suspense>
  );
}

async function PriceLarge() {
  const p = await deepPricingNow();
  if (!p.promo) {
    return (
      <p className="mt-1 text-3xl font-semibold">
        {formatUsd(p.cents)} <span className="text-base font-normal text-muted">· one-time</span>
      </p>
    );
  }
  return (
    <div className="mt-1">
      <p className="flex flex-wrap items-baseline gap-x-2 text-3xl font-semibold">
        <s className="text-xl font-normal text-muted">{formatUsd(p.regularCents)}</s>
        <span>{formatUsd(p.cents)}</span>
        <span className="text-base font-normal text-muted">· one-time</span>
      </p>
      <p className="mt-2 inline-flex rounded-full bg-accent/10 px-2.5 py-0.5 text-sm font-medium text-accent">
        {p.promo.label} -{p.promo.percentOff}% until {promoLastDay(p.promo.endsAt)}
      </p>
    </div>
  );
}

/** Checkout button labelled with the current price. */
export function DeepCheckoutNow({ url }: { url?: string }) {
  return (
    <Suspense fallback={<DeepCheckout url={url} price={deepReportRegularPrice()} />}>
      <CheckoutNow url={url} />
    </Suspense>
  );
}

async function CheckoutNow({ url }: { url?: string }) {
  const p = await deepPricingNow();
  return <DeepCheckout url={url} price={formatUsd(p.cents)} />;
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
  const p = await deepPricingNow();
  if (!p.promo) return null;
  const lastDay = promoLastDay(p.promo.endsAt);
  return (
    <div className="bg-accent text-white">
      <a
        href="#deep-report"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm sm:px-6"
      >
        <span className="font-semibold">
          {p.promo.label}: -{p.promo.percentOff}% on the Deep Report
        </span>
        <span>
          <s className="opacity-75">{formatUsd(p.regularCents)}</s> {formatUsd(p.cents)} until {lastDay}
        </span>
        <span className="rounded-full bg-white/15 px-2 py-0.5 font-medium tabular-nums">
          <PromoCountdown endsAt={p.promo.endsAt} fallback={`Ends ${lastDay}`} />
        </span>
        <span className="font-semibold underline underline-offset-4">Get it →</span>
      </a>
    </div>
  );
}
