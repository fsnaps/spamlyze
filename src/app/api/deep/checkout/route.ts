import { FetchBlockedError, normalizeInputUrl, safeFetch } from "@/lib/check/safe-fetch";
import { createDeepReport } from "@/lib/deep/job";
import { site } from "@/lib/site";
import { DEEP_REPORT_PRICE_CENTS, stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  let url: URL;
  try {
    url = normalizeInputUrl(typeof body?.url === "string" ? body.url : "");
    // Make sure we can reach the site before taking payment.
    const home = await safeFetch(url, 10000);
    if (home.status >= 400 || !/html/i.test(home.contentType)) {
      return Response.json({ error: `We couldn't load ${url.hostname} (HTTP ${home.status}).` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof FetchBlockedError) return Response.json({ error: err.message }, { status: 400 });
    return Response.json({ error: "We couldn't load your homepage. Is the site online?" }, { status: 400 });
  }

  try {
    const id = await createDeepReport(url);
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: DEEP_REPORT_PRICE_CENTS,
            product_data: {
              name: "Spamlyze Deep Report",
              description: `Page-by-page spam risk analysis of ${url.hostname} (up to 500 pages)`,
            },
          },
        },
      ],
      metadata: { deepId: id, domain: url.hostname },
      payment_intent_data: { metadata: { deepId: id, domain: url.hostname } },
      allow_promotion_codes: true,
      success_url: `${site.url}/deep/${id}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site.url}/?canceled=1#deep-report`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("deep checkout failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "Payments are temporarily unavailable. Please try again later." }, { status: 500 });
  }
}
