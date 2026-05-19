/** עובד ב-Edge (middleware) וב-Node (API) */
export async function authTokenFromPassword(
  password: string,
  secret: string
): Promise<string> {
  const data = new TextEncoder().encode(`${password}:${secret}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function authSecret(): string {
  return process.env.AUTH_SECRET || "participants-default-secret-change-me";
}
