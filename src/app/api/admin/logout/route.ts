import { connection, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin/session";
import { site } from "@/lib/site";

export async function GET() {
  // Run per request so the cookie is actually cleared.
  await connection();
  const res = NextResponse.redirect(site.url);
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
