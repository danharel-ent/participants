import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authSecret, authTokenFromPassword } from "@/lib/auth-token";
import { authCookieOptions, COOKIE_NAME } from "@/lib/auth-cookie";

export async function middleware(request: NextRequest) {
  const password = process.env.ACCESS_PASSWORD;
  const { pathname } = request.nextUrl;

  if (!password) return NextResponse.next();

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await authTokenFromPassword(password, authSecret());
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const isAuthed = cookie === token;

  if (pathname.startsWith("/login")) {
    if (isAuthed) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isAuthed) {
    // Sliding session: renew expiry on each authenticated request.
    const res = NextResponse.next();
    res.cookies.set(COOKIE_NAME, token, authCookieOptions(request.nextUrl.protocol === "https:"));
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "נדרשת כניסה" } },
      { status: 401 }
    );
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("from", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
