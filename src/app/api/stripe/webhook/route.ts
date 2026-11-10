import type Stripe from "stripe";
import { confirmPayment } from "@/lib/deep/job";
import { stripe } from "@/lib/stripe";

// Backup for the success redirect: starts the report even if the buyer closes the tab.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const id = session.metadata?.deepId;
    if (id) await confirmPayment(id, session.id);
  }
  return new Response("ok");
}
