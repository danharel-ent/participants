import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-card">
            <p className="login-sub">טוען…</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
