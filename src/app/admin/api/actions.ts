"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, readSession } from "@/lib/admin/session";
import { accounts } from "@/lib/api/accounts";
import { addCredits } from "@/lib/api/credits";
import { revokeApiKey } from "@/lib/api/keys";

// Server actions are reachable by POST from anywhere: each one checks the admin session itself,
// on top of the /admin proxy.
async function requireAdmin(): Promise<string> {
  const email = readSession((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!email) throw new Error("Not signed in as admin");
  return email;
}

const ACCOUNT_RE = /^acct_[A-Za-z0-9_-]{8,20}$/;

export async function revokeKeyAction(formData: FormData) {
  await requireAdmin();
  const keyId = String(formData.get("keyId") ?? "");
  if (!/^[0-9a-f]{64}$/.test(keyId)) return;
  await revokeApiKey(keyId);
  revalidatePath("/admin/api");
}

export async function setAccountStatusAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("accountId") ?? "");
  const status = formData.get("status") === "suspended" ? "suspended" : "active";
  if (!ACCOUNT_RE.test(id)) return;
  await accounts().doc(id).update({ status });
  revalidatePath("/admin/api");
}

export async function addCreditsAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("accountId") ?? "");
  const cents = Math.round(Number(formData.get("usd")) * 100);
  if (!ACCOUNT_RE.test(id) || !Number.isInteger(cents) || cents <= 0 || cents > 500_000) return;
  const note = `${String(formData.get("note") ?? "").slice(0, 120)} (by ${admin})`.trim();
  await addCredits(id, cents, "manual", `admin_${Date.now()}`, note);
  revalidatePath("/admin/api");
}
