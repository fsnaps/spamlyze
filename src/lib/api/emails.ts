import "server-only";
import { sendEmail } from "@/lib/brevo";
import { layout } from "@/lib/deep/emails";
import { site } from "@/lib/site";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const p = (text: string) => `<p style="margin:0 0 12px;line-height:1.6;color:#57534e">${text}</p>`;
const accountLink = () => `${site.url}/account`;

export function sendLowBalance(to: string, balanceCents: number) {
  return sendEmail(
    to,
    `Your Spamlyze API balance is low (${usd(balanceCents)})`,
    layout(
      `Your API balance is ${usd(balanceCents)}`,
      p("API calls that cost more than your balance will be refused (HTTP 402) until you add credits.") +
        p("Turn on automatic top-up in your account so this never stops your integration."),
      accountLink(),
      "Add credits",
    ),
  );
}

export function sendTopUpDone(to: string, creditedCents: number, balanceCents: number, last4: string) {
  return sendEmail(
    to,
    `Spamlyze API: ${usd(creditedCents)} of credits added automatically`,
    layout(
      `${usd(creditedCents)} of credits added`,
      p(`Your balance fell under your automatic top-up threshold, so we charged ${last4 ? `your card ending in ${last4}` : "your saved payment method"}.`) +
        p(`New balance: ${usd(balanceCents)}. The Stripe receipt follows in a separate email.`),
      accountLink(),
      "See your account",
    ),
  );
}

export function sendTopUpFailed(to: string, reason: string) {
  return sendEmail(
    to,
    "Spamlyze API: automatic top-up failed",
    layout(
      "Your automatic top-up failed",
      p(`We couldn't charge your saved card: ${reason.replace(/[<>&]/g, "")}`) +
        p("Automatic top-up is now off, so your card won't be retried. Buy a pack in your account to add credits and update your card, then turn it back on."),
      accountLink(),
      "Add credits",
    ),
  );
}
