"use server";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { addToBrevoWaitlist } from "@/lib/brevo";
import { db } from "@/lib/firebase-admin";

export type WaitlistState = {
  status: "idle" | "success" | "error";
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeSite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // Honeypot: real visitors never fill this hidden field.
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "success", message: "You're on the list." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  const site = normalizeSite(String(formData.get("site") ?? ""));
  const source = String(formData.get("source") ?? "landing").slice(0, 32);

  // One document per email, so signing up twice doesn't create duplicates.
  const id = createHash("sha256").update(email).digest("hex");

  try {
    await db()
      .collection("waitlist")
      .doc(id)
      .set(
        {
          email,
          ...(site ? { site } : {}),
          source,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    console.error("waitlist write failed", err);
    return {
      status: "error",
      message: "Something went wrong on our side. Please try again in a minute.",
    };
  }

  await addToBrevoWaitlist(email);

  return {
    status: "success",
    message: "You're on the list. We'll email you when early access opens.",
  };
}
