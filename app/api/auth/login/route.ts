import { NextResponse } from "next/server";
import { COOKIE_NAME, getAuthToken, verifyPassword } from "@/lib/auth";
import { authCookieOptions } from "@/lib/auth-cookie";
import { errorResponse, okResponse } from "@/lib/api-response";
import { checkRateLimit, clientFingerprint } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = clientFingerprint(request);
  const limit = checkRateLimit(`login:${ip}`, 10, 60 * 1000);
  if (!limit.ok) {
    return errorResponse(
      "RATE_LIMITED",
      "יותר מדי ניסיונות התחברות. נסו שוב בעוד דקה.",
      { retryAfterSec: limit.retryAfterSec },
      { headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const expectedPassword = process.env.ACCESS_PASSWORD || "";
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = String(body?.password ?? "");
  } catch {
    return errorResponse("VALIDATION_ERROR", "בקשה לא תקינה");
  }

  if (!expectedPassword) {
    return okResponse({ status: "no-password-set" });
  }

  if (password.length === 0 || password.length > 200) {
    return errorResponse("VALIDATION_ERROR", "סיסמה לא תקינה");
  }

  if (!verifyPassword(password)) {
    return errorResponse("UNAUTHORIZED", "סיסמה שגויה");
  }

  const res = NextResponse.json({
    ok: true,
    data: { status: "ok" },
    meta: { updatedAt: new Date().toISOString() },
  });
  res.cookies.set(
    COOKIE_NAME,
    await getAuthToken(),
    authCookieOptions(process.env.NODE_ENV === "production")
  );
  return res;
}
