import { NextResponse, type NextRequest } from "next/server";
import { adminEmails, ADMIN_COOKIE, ADMIN_NONCE, adminRedirect, makeSession, SESSION_DAYS } from "@/lib/admin/session";
import { exchangeCode, readState, revoke } from "@/lib/gsc/oauth";
import { site } from "@/lib/site";

const denied = (why: string) => new NextResponse(`Access denied: ${why}`, { status: 403 });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (readState(params.get("state"), request.cookies.get(ADMIN_NONCE)?.value) !== "admin") return denied("sign-in expired, try again.");
  const code = params.get("code");
  if (!code) return denied("sign-in cancelled.");

  const t = await exchangeCode(code, adminRedirect()).catch(() => null);
  if (!t?.idToken) return denied("Google sign-in failed.");
  await revoke(t.accessToken);
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be trusted as is.
  const claims = JSON.parse(Buffer.from(t.idToken.split(".")[1], "base64url").toString()) as {
    aud?: string;
    email?: string;
    email_verified?: boolean;
  };
  const email = claims.email?.toLowerCase();
  if (claims.aud !== process.env.GOOGLE_OAUTH_CLIENT_ID || !claims.email_verified || !email || !adminEmails().includes(email)) {
    return denied("this Google account is not an admin.");
  }
  const res = NextResponse.redirect(`${site.url}/admin`);
  res.cookies.set(ADMIN_COOKIE, makeSession(email), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_DAYS * 86_400,
    path: "/",
  });
  res.cookies.delete({ name: ADMIN_NONCE, path: "/api/admin" });
  return res;
}
