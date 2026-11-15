import "server-only";
import { db } from "@/lib/firebase-admin";
import type { GscData } from "./data";

/** A Quick Check's Search Console import, readable only with its private id. */
export async function getQuickImport(importId: string | undefined, checkId: string): Promise<GscData | undefined> {
  if (!importId || !/^[A-Za-z0-9_-]{16,40}$/.test(importId)) return undefined;
  const snap = await db().collection("gscImports").doc(importId).get();
  if (!snap.exists || snap.get("checkId") !== checkId) return undefined;
  const expires = snap.get("expiresAt") as FirebaseFirestore.Timestamp | undefined;
  if (expires && expires.toMillis() < Date.now()) return undefined;
  return snap.get("gsc") as GscData;
}
