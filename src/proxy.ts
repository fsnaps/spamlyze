import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Basic auth for /admin. The user name is ignored; the password is the ADMIN_PASSWORD secret.
export function proxy(request: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  const header = request.headers.get("authorization") ?? "";
  if (expected && header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const password = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
    const target = Buffer.from(expected);
    if (password.length === target.length && timingSafeEqual(password, target)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Spamlyze admin"' },
  });
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
