"use server";

import { revalidatePath } from "next/cache";
import { MAX_ACTIVE_KEYS, requireMyAccount } from "@/lib/account/access";
import { createApiKey, keys, listApiKeys, revokeApiKey } from "@/lib/api/keys";
import { accounts } from "@/lib/api/accounts";
import { getPack, TOP_UP_THRESHOLDS } from "@/lib/api/packs";
import { removeWebhook, setWebhook, validateWebhookUrl, WebhookUrlError } from "@/lib/api/webhooks";

// Every action checks on its own that the account belongs to the signed-in email:
// server actions can be POSTed directly, so the page being protected is not enough.

export type NewKeyState = { key: string | null; error: string | null };

export async function createKeyAction(_prev: NewKeyState, formData: FormData): Promise<NewKeyState> {
  const { id, account } = await requireMyAccount(formData.get("accountId"));
  if (account.status !== "active") return { key: null, error: "This account is suspended. Contact hello@spamlyze.com." };
  const active = (await listApiKeys(id)).filter((k) => !k.revokedAt).length;
  if (active >= MAX_ACTIVE_KEYS) return { key: null, error: `At most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` };
  const name = String(formData.get("name") ?? "").trim().slice(0, 60) || "Default";
  const { key } = await createApiKey(id, name);
  revalidatePath("/account");
  return { key, error: null };
}

export async function revokeKeyAction(formData: FormData) {
  const { id } = await requireMyAccount(formData.get("accountId"));
  const keyId = String(formData.get("keyId") ?? "");
  if (!/^[0-9a-f]{64}$/.test(keyId)) return;
  const snap = await keys().doc(keyId).get();
  if (snap.get("accountId") !== id) return;
  await revokeApiKey(keyId);
  revalidatePath("/account");
}

export type WebhookState = { error: string | null; saved: boolean };

export async function setWebhookAction(_prev: WebhookState, formData: FormData): Promise<WebhookState> {
  const { id } = await requireMyAccount(formData.get("accountId"));
  const raw = String(formData.get("url") ?? "").trim();
  try {
    if (raw) await setWebhook(id, await validateWebhookUrl(raw));
    else await removeWebhook(id);
  } catch (err) {
    if (err instanceof WebhookUrlError) return { error: err.message, saved: false };
    throw err;
  }
  revalidatePath("/account");
  return { error: null, saved: true };
}

export type AutoTopUpState = { error: string | null; saved: boolean };

export async function setAutoTopUpAction(_prev: AutoTopUpState, formData: FormData): Promise<AutoTopUpState> {
  const { id, account } = await requireMyAccount(formData.get("accountId"));
  const enabled = formData.get("enabled") === "on";
  const thresholdCents = Number(formData.get("threshold"));
  const pack = getPack(formData.get("packId"));
  if (!TOP_UP_THRESHOLDS.includes(thresholdCents) || !pack) return { error: "Pick a threshold and a pack.", saved: false };
  if (enabled && !account.paymentMethod) return { error: "Buy a pack once first: that saves your card for top-ups.", saved: false };
  await accounts()
    .doc(id)
    .update({
      autoTopUp: { enabled, thresholdCents, packId: pack.id },
      ...(enabled ? { "topUpState.lastError": null } : {}),
    });
  revalidatePath("/account");
  return { error: null, saved: true };
}
