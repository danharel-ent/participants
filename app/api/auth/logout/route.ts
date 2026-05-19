import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { authCookieOptions } from "@/lib/auth-cookie";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", authCookieOptions(process.env.NODE_ENV === "production", 0));
  return res;
}
