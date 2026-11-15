import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, readSession } from "@/lib/admin/session";

// /admin requires a Google sign-in with an address listed in ADMIN_EMAILS.
export function proxy(request: NextRequest) {
  if (readSession(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/api/admin/login", request.url));
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
