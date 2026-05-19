import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { authSecret, authTokenFromPassword } from "@/lib/auth-token";
import { COOKIE_NAME } from "@/lib/auth-cookie";

export async function getAuthToken(): Promise<string> {
  const password = process.env.ACCESS_PASSWORD || "";
  return authTokenFromPassword(password, authSecret());
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.ACCESS_PASSWORD;
  if (!expected || !input) return false;
  const a = Buffer.from(input, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!process.env.ACCESS_PASSWORD) return true;
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  return token === (await getAuthToken());
}

export { COOKIE_NAME };
