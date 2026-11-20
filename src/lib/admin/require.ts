import "server-only";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSession } from "./session";

/**
 * Server actions can be POSTed from anywhere: each admin action calls this itself, on top of
 * the /admin proxy. Returns the admin's email or throws.
 */
export async function requireAdmin(): Promise<string> {
  const email = readSession((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!email) throw new Error("Not signed in as admin");
  return email;
}
