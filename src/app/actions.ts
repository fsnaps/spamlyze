"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { addToBrevoWaitlist } from "@/lib/brevo";
import { clientIp } from "@/lib/check/guard";
import { getCheck } from "@/lib/check/run";
import { sendQuickReport } from "@/lib/check/report-email";
import { track } from "@/lib/stats";
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
          interests: FieldValue.arrayUnion(source === "monitoring" || source === "api" ? source : "deep_report"),
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

  await Promise.all([
    addToBrevoWaitlist(email, source === "monitoring" || source === "api" ? source : "waitlist"),
    track(
      source === "monitoring"
        ? { signupsMonitoring: 1 }
        : source === "api"
          ? { signupsApi: 1 }
        : source === "report"
          ? { signupsReport: 1 }
          : { signupsWaitlist: 1 },
    ),
  ]);

  return {
    status: "success",
    message:
      source === "monitoring"
        ? "Thanks! We'll email you as soon as Monitoring opens."
        : source === "api"
          ? "Thanks! We'll email you when the API opens, with early access details."
        : "You're on the list. We'll email you when the next spam update rolls out.",
  };
}

export type ReportEmailState = WaitlistState;

// The form sends mail to an address typed by a visitor: cap it so it can't be used to spam people.
const REPORT_EMAILS_PER_CHECK = 3;
const REPORT_EMAILS_PER_IP_DAILY = 5;

class LimitError extends Error {}

/**
 * Optional step after a Quick Check: emails the full report to the visitor and signs them up for
 * spam update alerts (Firestore `waitlist` + Brevo). The report itself is never gated on this.
 */
export async function emailQuickReport(
  _prev: ReportEmailState,
  formData: FormData,
): Promise<ReportEmailState> {
  if (String(formData.get("company") ?? "").trim()) {
    return { status: "success", message: "Sent! Check your inbox." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: "error", message: "Please enter a valid email address." };
  }
  const checkId = String(formData.get("checkId") ?? "");
  const check = /^[\w-]{6,32}$/.test(checkId) ? await getCheck(checkId) : null;
  if (!check) return { status: "error", message: "We couldn't find this report. Please reload the page." };

  const emailId = createHash("sha256").update(email).digest("hex");
  const salt = process.env.IP_HASH_SALT ?? "spamlyze";
  const ipKey = createHash("sha256")
    .update(`${salt}:${clientIp(await headers())}`)
    .digest("hex")
    .slice(0, 32);
  const day = new Date().toISOString().slice(0, 10);
  const checkRef = db().collection("checks").doc(checkId);
  const ipRef = db().collection("rateLimits").doc(`reportEmail_${ipKey}_${day}`);

  let alreadySent = false;
  try {
    await db().runTransaction(async (tx) => {
      const [checkSnap, ipSnap] = await Promise.all([tx.get(checkRef), tx.get(ipRef)]);
      const sentTo = (checkSnap.get("emailedTo") as string[] | undefined) ?? [];
      if (sentTo.includes(emailId)) {
        alreadySent = true;
        return;
      }
      if (sentTo.length >= REPORT_EMAILS_PER_CHECK || (ipSnap.get("count") ?? 0) >= REPORT_EMAILS_PER_IP_DAILY) {
        throw new LimitError();
      }
      tx.update(checkRef, { emailedTo: FieldValue.arrayUnion(emailId) });
      tx.set(
        ipRef,
        { count: FieldValue.increment(1), expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86_400_000) },
        { merge: true },
      );
    });
    if (alreadySent) {
      return { status: "success", message: `Already sent to ${email}. Check your spam folder if you can't find it.` };
    }
    await db()
      .collection("waitlist")
      .doc(emailId)
      .set(
        {
          email,
          site: check.domain,
          source: "quick_check",
          interests: FieldValue.arrayUnion("update_alerts"),
          checkIds: FieldValue.arrayUnion(checkId),
          lastRiskScore: check.analysis?.riskScore ?? null,
          reportEmailedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    if (err instanceof LimitError) {
      return { status: "error", message: "This report has already been sent several times. Please try again tomorrow." };
    }
    console.error("report email write failed", err);
    return { status: "error", message: "Something went wrong on our side. Please try again in a minute." };
  }

  const [sent] = await Promise.all([
    sendQuickReport(email, checkId, check),
    addToBrevoWaitlist(email, "alerts"),
    track({ reportEmails: 1 }),
  ]);
  if (!sent) {
    return { status: "error", message: "We couldn't send the email right now. Please try again in a minute." };
  }
  return {
    status: "success",
    message: `Sent to ${email}. We'll also warn you when Google rolls out a spam update.`,
  };
}
