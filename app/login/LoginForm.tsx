"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginResponse = {
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
};

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
          <div className="login-input-wrap">
            <input
              id="password"
              name="password"
              className="login-input login-input-with-eye"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="הזינו סיסמה…"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
            <button
              type="button"
              className="login-eye-btn"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
              aria-pressed={showPassword}
              tabIndex={0}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
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
