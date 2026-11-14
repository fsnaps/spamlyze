import { NextResponse, type NextRequest } from "next/server";
import { getDeepReport, isDeepId } from "@/lib/deep/job";
import { authUrl, gscEnabled, makeState, NONCE_COOKIE } from "@/lib/gsc/oauth";

/** Starts the Google consent flow for one Deep Report. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("deep") ?? "";
  if (!gscEnabled() || !isDeepId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const report = await getDeepReport(id);
  if (!report || report.status === "awaiting_payment") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { state, nonce } = makeState(id);
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/gsc" });
  return res;
}
