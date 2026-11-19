import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";

/**
 * Records, on the report itself, that someone clicked "Connect Search Console" or that the
 * attempt failed (counters and dates only, never a token). /admin uses it to tell apart
 * reports where nobody tried from those where people tried and gave up. Never throws.
 */
export async function noteGsc(kind: "c" | "d", id: string, event: "start" | "denied" | "no_property" | "error") {
  const now = FieldValue.serverTimestamp();
  const fields =
    event === "start" ? { gscStarts: FieldValue.increment(1), gscStartedAt: now } : { gscFailure: event, gscFailedAt: now };
  try {
    await db()
      .collection(kind === "d" ? "deepReports" : "checks")
      .doc(id)
      .update(fields);
  } catch (err) {
    console.error("gsc note failed", kind, id, err instanceof Error ? err.message : err);
  }
}
