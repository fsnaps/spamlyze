import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_COOKIE, ACCOUNT_NONCE, ACCOUNT_SESSION_DAYS, accountRedirect, makeAccountSession } from "@/lib/account/session";
import { exchangeCode, readState, revoke } from "@/lib/gsc/oauth";
import { site } from "@/lib/site";

const back = (why: string) => NextResponse.redirect(`${site.url}/account?error=${encodeURIComponent(why)}`);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (readState(params.get("state"), request.cookies.get(ACCOUNT_NONCE)?.value) !== "account") return back("expired");
  const code = params.get("code");
  if (!code) return back("cancelled");

  const t = await exchangeCode(code, accountRedirect()).catch(() => null);
  if (!t?.idToken) return back("failed");
  await revoke(t.accessToken);
  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be trusted as is.
  const claims = JSON.parse(Buffer.from(t.idToken.split(".")[1], "base64url").toString()) as {
    aud?: string;
    email?: string;
    email_verified?: boolean;
  };
  const email = claims.email?.toLowerCase();
  if (claims.aud !== process.env.GOOGLE_OAUTH_CLIENT_ID || !claims.email_verified || !email) return back("failed");

  const res = NextResponse.redirect(`${site.url}/account`);
  res.cookies.set(ACCOUNT_COOKIE, makeAccountSession(email), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: ACCOUNT_SESSION_DAYS * 86_400,
    path: "/",
  });
  res.cookies.delete({ name: ACCOUNT_NONCE, path: "/api/account" });
  return res;
}
