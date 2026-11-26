"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require";
import { syncRankingUpdates } from "@/lib/gsc/update-feed";

export async function syncNowAction() {
  await requireAdmin();
  await syncRankingUpdates();
  revalidatePath("/admin/updates");
}
