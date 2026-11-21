import "server-only";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { cancelScheduledEmail } from "@/lib/brevo";
import { db } from "@/lib/firebase-admin";

/** A buyer doesn't need the "see what's left" follow-up: cancel it if one is still scheduled. Never throws. */
export async function cancelFollowUp(email: string): Promise<void> {
  try {
    const ref = db().collection("waitlist").doc(createHash("sha256").update(email.trim().toLowerCase()).digest("hex"));
    const snap = await ref.get();
    const messageId = snap.get("followUpMessageId") as string | undefined;
    const at = snap.get("followUpAt") as FirebaseFirestore.Timestamp | undefined;
    if (!messageId || !at || at.toMillis() < Date.now()) return;
    await cancelScheduledEmail(messageId);
    await ref.update({ followUpMessageId: FieldValue.delete(), followUpCancelledAt: FieldValue.serverTimestamp() });
  } catch (err) {
    console.error("follow-up cancel failed", err);
  }
}
