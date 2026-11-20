import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { track } from "@/lib/stats";

export type CheckoutBlockReason = "robots" | "challenge" | "unreachable";

/** A buyer wanted a Deep Report for a site we can't crawl: kept 90 days for /admin/checkouts. */
export async function recordCheckoutBlock(
  domain: string,
  reason: CheckoutBlockReason,
  message: string,
  source: "site" | "api" = "site",
) {
  try {
    await Promise.all([
      db()
        .collection("checkoutBlocks")
        .add({
          domain: domain.toLowerCase().replace(/^www\./, ""),
          reason,
          message: message.slice(0, 500),
          source,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
        }),
      track({ deepBlockedAtCheckout: 1 }),
    ]);
  } catch (err) {
    console.error("checkout block not recorded", err instanceof Error ? err.message : err);
  }
}
