export const COOKIE_NAME = "participants_auth";

// Keep users signed in for 90 days.
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function authCookieOptions(secure: boolean, maxAge = AUTH_SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
