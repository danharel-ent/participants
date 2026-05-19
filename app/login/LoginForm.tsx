"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginResponse = {
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
};

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok || !data.ok) {
        setError(data.error?.message || "סיסמה שגויה");
        return;
      }
      const from = searchParams.get("from") || "/";
      router.replace(from);
      router.refresh();
    } catch {
      setError("שגיאת רשת — נסו שוב");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-dot" aria-hidden="true" />
          <span className="login-brand-name">WineNot Ops</span>
        </div>
        <h1 className="login-title">כניסה לצוות</h1>
        <p className="login-sub">סריקת מימוש כרטיסים · גישה מורשית בלבד</p>
        <form onSubmit={onSubmit} className="login-form" noValidate>
          <label className="login-label" htmlFor="password">
            סיסמה
          </label>
          <input
            id="password"
            name="password"
            className="login-input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="הזינו סיסמה…"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
          />
          {error ? (
            <p id="login-error" className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="login-btn" disabled={loading || !password}>
            {loading ? "נכנס…" : "כניסה"}
          </button>
        </form>
        <p className="login-footnote">
          מערכת פנימית · הסשן נשמר אוטומטית לאחר התחברות
        </p>
      </div>
    </div>
  );
}
