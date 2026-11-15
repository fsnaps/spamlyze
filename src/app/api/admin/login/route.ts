import { NextResponse } from "next/server";
import { authUrl, gscEnabled, makeState } from "@/lib/gsc/oauth";
import { ADMIN_NONCE, adminRedirect } from "@/lib/admin/session";

export async function GET() {
  if (!gscEnabled()) return new NextResponse("Google sign-in is not configured", { status: 503 });
  const { state, nonce } = makeState("admin");
  const res = NextResponse.redirect(authUrl(state, "openid email", adminRedirect()));
  res.cookies.set(ADMIN_NONCE, nonce, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/admin" });
  return res;
}
