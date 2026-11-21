import { NextResponse } from "next/server";
import { accessCookie, accessCookieValue, validSignInToken } from "@/lib/deep/access";
import { getDeepReport, isDeepId } from "@/lib/deep/job";
import { site } from "@/lib/site";

// Sign-in link from the email: sets the access cookie for a private report, then opens it.
export async function GET(request: Request, ctx: RouteContext<"/api/deep/[id]/access">) {
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("k");
  const report = isDeepId(id) ? await getDeepReport(id) : null;
  if (!report || !validSignInToken(id, report.email, token)) {
    return NextResponse.redirect(`${site.url}/deep/${isDeepId(id) ? id : ""}?access=expired`);
  }
  const res = NextResponse.redirect(`${site.url}/deep/${id}`);
  const { value, maxAge } = accessCookieValue(id);
  res.cookies.set(accessCookie(id), value, {
    path: "/",
    maxAge,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
