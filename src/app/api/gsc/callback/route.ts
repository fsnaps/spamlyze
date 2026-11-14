import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/firebase-admin";
import { getDeepReport } from "@/lib/deep/job";
import { findProperty, GscError, importSearchData } from "@/lib/gsc/data";
import { exchangeCode, GSC_SCOPE, NONCE_COOKIE, readState, revoke } from "@/lib/gsc/oauth";
import { site } from "@/lib/site";
import { track } from "@/lib/stats";

/** Google redirects here after consent: import the data once, then forget the token. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = readState(params.get("state"), request.cookies.get(NONCE_COOKIE)?.value);
  if (!id) return NextResponse.redirect(`${site.url}/?gsc=expired`);

  const back = (result: string) => {
    const res = NextResponse.redirect(`${site.url}/deep/${id}?gsc=${result}#search-console`);
    res.cookies.delete({ name: NONCE_COOKIE, path: "/api/gsc" });
    return res;
  };

  const code = params.get("code");
  if (params.get("error") || !code) return back("denied");
  const report = await getDeepReport(id);
  if (!report) return back("error");

  let token: string | null = null;
  try {
    const t = await exchangeCode(code);
    token = t.accessToken;
    if (!t.scope.split(" ").includes(GSC_SCOPE)) return back("denied");
    const property = await findProperty(token, report.domain);
    const gsc = await importSearchData(token, property);
    await db().collection("deepReports").doc(id).update({ gsc });
    await track({ gscConnected: 1 });
    return back("connected");
  } catch (err) {
    console.error("gsc import failed", id, err instanceof Error ? err.message : err);
    return back(err instanceof GscError && err.code === "no_property" ? "no_property" : "error");
  } finally {
    if (token) await revoke(token);
  }
}
