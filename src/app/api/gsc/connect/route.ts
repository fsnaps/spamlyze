import { NextResponse, type NextRequest } from "next/server";
import { getCheck } from "@/lib/check/run";
import { getDeepReport, isDeepId } from "@/lib/deep/job";
import { authUrl, gscEnabled, makeState, NONCE_COOKIE } from "@/lib/gsc/oauth";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** Starts the Google consent flow for a Deep Report (?deep=) or a Quick Check (?check=). */
export async function GET(request: NextRequest) {
  if (!gscEnabled()) return notFound();
  const q = request.nextUrl.searchParams;
  let target: string;
  if (q.get("deep")) {
    const id = q.get("deep")!;
    const report = isDeepId(id) ? await getDeepReport(id) : null;
    if (!report || report.status === "awaiting_payment") return notFound();
    target = `d~${id}`;
  } else {
    const id = q.get("check") ?? "";
    if (!(await getCheck(id))) return notFound();
    target = `c~${id}`;
  }
  const { state, nonce } = makeState(target);
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/gsc" });
  return res;
}
