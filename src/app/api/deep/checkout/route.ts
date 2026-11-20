import { CrawlError, botChallengeMessage, discoverSite, probeCrawlable } from "@/lib/check/crawl";
import { FetchBlockedError, normalizeInputUrl } from "@/lib/check/safe-fetch";
import { createDeepReport } from "@/lib/deep/job";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";
import { recordCheckoutBlock } from "@/lib/deep/blocks";
import { deepPricing, tierFor, tierMaxPages } from "@/lib/pricing";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown; large?: unknown } | null;
  let url: URL;
  let sitemapUrlCount: number | null;
  let host: string | null = null;
  try {
    url = normalizeInputUrl(typeof body?.url === "string" ? body.url : "");
    host = url.hostname;
    // Make sure we can reach the site, and count its pages to price it, before taking payment.
    const site = await discoverSite(url);
    if (site.robotsBlocked) {
      const error = `${url.hostname} blocks crawlers in its robots.txt, so we can't analyze it.`;
      await recordCheckoutBlock(url.hostname, "robots", error);
      return Response.json({ error }, { status: 400 });
    }
    // Some firewalls let the homepage through and challenge every other page: check before charging.
    if ((await probeCrawlable(site)).blocked) {
      const error = `${botChallengeMessage(url.hostname)} You were not charged.`;
      await recordCheckoutBlock(url.hostname, "challenge", error);
      return Response.json({ error }, { status: 400 });
    }
    sitemapUrlCount = site.sitemapUrlCount;
  } catch (err) {
    const error =
      err instanceof FetchBlockedError || err instanceof CrawlError ? err.message : "We couldn't load your homepage. Is the site online?";
    // An invalid address isn't worth listing: only sites we found but couldn't crawl.
    if (host && !(err instanceof FetchBlockedError)) {
      await recordCheckoutBlock(host, /anti-bot/.test(error) ? "challenge" : "unreachable", error);
    }
    return Response.json({ error }, { status: 400 });
  }

  try {
    const tier = tierFor(sitemapUrlCount, body?.large === true);
    const maxPages = tierMaxPages(tier);
    // Priced at request time, so a promo starts and ends on schedule without a redeploy.
    const pricing = deepPricing(Date.now(), tier);
    const promo = pricing.promo;
    const id = await createDeepReport(url, { tier, maxPages, priceCents: pricing.cents, sitemapUrlCountAtCheckout: sitemapUrlCount });
    const found =
      sitemapUrlCount === null
        ? "No sitemap found"
        : `${sitemapUrlCount.toLocaleString("en-US")} page${sitemapUrlCount === 1 ? "" : "s"} found in your sitemap`;
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pricing.cents,
            product_data: {
              name: `Spamlyze Deep Report, up to ${maxPages} pages${promo ? ` (${promo.label} -${promo.percentOff}%)` : ""}`,
              description: `Page-by-page spam risk analysis of ${url.hostname}. ${found}.`,
            },
          },
        },
      ],
      metadata: {
        deepId: id,
        domain: url.hostname,
        tier,
        sitemapUrls: String(sitemapUrlCount ?? "none"),
        ...(promo && { promo: `${promo.label} -${promo.percentOff}%` }),
      },
      payment_intent_data: { metadata: { deepId: id, domain: url.hostname } },
      allow_promotion_codes: true,
      success_url: `${site.url}/deep/${id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site.url}/?canceled=1#deep-report`,
    });
    await track({ deepCheckouts: 1 });
    return Response.json({ url: session.url, cents: pricing.cents });
  } catch (err) {
    console.error("deep checkout failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "Payments are temporarily unavailable. Please try again later." }, { status: 500 });
  }
}
