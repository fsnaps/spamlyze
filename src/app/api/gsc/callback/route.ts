import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/firebase-admin";
import { getCheck } from "@/lib/check/run";
import { attachSearchConsole, getDeepReport } from "@/lib/deep/job";
import { findProperty, GscError, importSearchData } from "@/lib/gsc/data";
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
  const back = (result: string, extra = "") => {
    const res = NextResponse.redirect(`${site.url}${page}?gsc=${result}${extra}#search-console`);
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
    const { data: gsc, losses } = await importSearchData(token, property);
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
    return back("connected", `&g=${importId}`);
  } catch (err) {
    console.error("gsc import failed", target, err instanceof Error ? err.message : err);
    return back(err instanceof GscError && err.code === "no_property" ? "no_property" : "error");
  } finally {
    if (token) await revoke(token);
  }
}
