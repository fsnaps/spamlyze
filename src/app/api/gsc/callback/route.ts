import { randomBytes } from "node:crypto";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/firebase-admin";
import { getCheck } from "@/lib/check/run";
import { attachSearchConsole, getDeepReport } from "@/lib/deep/job";
import { noteGsc } from "@/lib/gsc/activity";
import { findProperty, GscError, importSearchData } from "@/lib/gsc/data";
import { getRankingUpdates } from "@/lib/gsc/update-feed";
import { exchangeCode, GSC_SCOPE, NONCE_COOKIE, readState, revoke } from "@/lib/gsc/oauth";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";

const QUICK_IMPORT_DAYS = 30;

/** Google redirects here after consent: import the data once, then forget the token. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const target = readState(params.get("state"), request.cookies.get(NONCE_COOKIE)?.value);
  const [kind, id] = target?.split("~") ?? [];
  if (!id || (kind !== "d" && kind !== "c")) return NextResponse.redirect(`${site.url}/?gsc=expired`);

  const page = kind === "d" ? `/deep/${id}` : `/report/${id}`;
  // A report ordered through the API: the site owner only connects Search Console. They get a
  // confirmation page, not the progress page meant for the buyer.
  const apiReport = kind === "d" && (await getDeepReport(id))?.source === "api";
  const back = async (result: "connected" | "denied" | "no_property" | "error", extra = "") => {
    if (result !== "connected") await Promise.all([noteGsc(kind, id, result), track({ gscFailed: 1 })]);
    const res = NextResponse.redirect(
      apiReport && result === "connected" ? `${site.url}/deep/${id}/connected` : `${site.url}${page}?gsc=${result}${extra}#search-console`,
    );
    res.cookies.delete({ name: NONCE_COOKIE, path: "/api/gsc" });
    return res;
  };

  const code = params.get("code");
  if (params.get("error") || !code) return back("denied");
  const domain = kind === "d" ? (await getDeepReport(id))?.domain : (await getCheck(id))?.domain;
  if (!domain) return back("error");

  let token: string | null = null;
  try {
    const t = await exchangeCode(code);
    token = t.accessToken;
    if (!t.scope.split(" ").includes(GSC_SCOPE)) return back("denied");
    const property = await findProperty(token, domain);
    const { data: gsc, losses } = await importSearchData(token, property, await getRankingUpdates());
    await track({ gscConnected: 1 });
    if (kind === "d") {
      // The job crawls and reviews the pages that lost clicks first, and ties the action plan to them.
      await attachSearchConsole(id, gsc, losses);
      return back("connected");
    }
    // Quick Checks are shared by everyone who checks the same domain, so the
    // imported figures live under their own private id, given only to this visitor.
    // The free version keeps the page count but not the list of pages.
    const importId = randomBytes(16).toString("base64url");
    await db()
      .collection("gscImports")
      .doc(importId)
      .set({
        checkId: id,
        gsc: { ...gsc, losers: gsc.losers ? { update: gsc.losers.update, pages: [] } : null },
        expiresAt: Timestamp.fromMillis(Date.now() + QUICK_IMPORT_DAYS * 86_400_000),
      });
    // Admin only: shows which Quick Checks had Search Console connected.
    await db()
      .collection("checks")
      .doc(id)
      .update({ gscConnectedAt: FieldValue.serverTimestamp() })
      .catch(() => {});
    return back("connected", `&g=${importId}`);
  } catch (err) {
    console.error("gsc import failed", target, err instanceof Error ? err.message : err);
    return back(err instanceof GscError && err.code === "no_property" ? "no_property" : "error");
  } finally {
    if (token) await revoke(token);
  }
}
