import { connection, NextResponse } from "next/server";
import { ACCOUNT_COOKIE } from "@/lib/account/session";
import { site } from "@/lib/site";

export async function GET() {
  await connection();
  const res = NextResponse.redirect(site.url);
  res.cookies.delete(ACCOUNT_COOKIE);
  return res;
}
