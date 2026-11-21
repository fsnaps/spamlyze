"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { accessCookie, accessCookieValue, canViewDeep, privateModeAvailable, signInToken } from "@/lib/deep/access";
import { sendDeepSignIn } from "@/lib/deep/emails";
import { getDeepReport, isDeepId } from "@/lib/deep/job";

export type AccessState = { status: "idle" | "sent" | "error"; message: string };

const ref = (id: string) => db().collection("deepReports").doc(id);

/** Makes a report private (anyone who can see it may) or public again (only someone with access). */
export async function setDeepPrivacy(id: string, makePrivate: boolean): Promise<void> {
  if (!isDeepId(id)) return;
  const report = await getDeepReport(id);
  if (!report || report.status !== "done" || !privateModeAvailable(report)) return;
  if (!(await canViewDeep(id, report))) return;
  if (makePrivate) {
    // Keep access in this browser first, so the person who locks it never locks themselves out.
    const { value, maxAge } = accessCookieValue(id);
    (await cookies()).set(accessCookie(id), value, {
      path: "/",
      maxAge,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  await ref(id).update({ private: makePrivate });
  refresh();
}

/** Emails a one-hour sign-in link if the address is the purchase email. Never says whether it is. */
export async function requestDeepAccess(id: string, _prev: AccessState, formData: FormData): Promise<AccessState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Please enter a valid email address." };
  const sent: AccessState = {
    status: "sent",
    message: "If this is the email used to buy the report, a sign-in link is on its way. It works for one hour.",
  };
  if (!isDeepId(id)) return sent;
  const report = await getDeepReport(id);
  if (!report?.private || !report.email || report.email.toLowerCase() !== email) return sent;
  // One link a minute at most.
  if ((report.accessEmailAt?.toMillis() ?? 0) > Date.now() - 60_000) return sent;
  await ref(id).update({ accessEmailAt: FieldValue.serverTimestamp() });
  await sendDeepSignIn(report.email, id, report.domain, signInToken(id, report.email));
  return sent;
}
