import { NextResponse } from "next/server";
import { authUrl, gscEnabled, makeState } from "@/lib/gsc/oauth";
import { ACCOUNT_NONCE, accountRedirect } from "@/lib/account/session";

/** Google sign-in for the API account page (email only, no other Google data). */
export async function GET() {
  if (!gscEnabled()) return new NextResponse("Google sign-in is not configured", { status: 503 });
  const { state, nonce } = makeState("account");
  const res = NextResponse.redirect(authUrl(state, "openid email", accountRedirect()));
  res.cookies.set(ACCOUNT_NONCE, nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/account" });
  return res;
}
