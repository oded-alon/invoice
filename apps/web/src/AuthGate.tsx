import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import App from "./App";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type AuthUser = { id: string; email: string; displayName: string };

type AuthMode = "login" | "register" | "forgot";

// ─── Reset Password Screen ────────────────────────────────────────────────────

function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword })
      });

      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "שגיאה באיפוס הסיסמה");

      setSuccess(true);
      // Remove token from URL without page reload
      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white text-3xl mb-4">₪</div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">חשבונית IL</h1>
        </div>

        <div className="rounded-[28px] bg-white p-8 shadow-sm shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-950">
          <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">איפוס סיסמה</h2>
          <p className="mb-5 text-sm text-slate-500">בחרו סיסמה חדשה לחשבון שלכם.</p>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                הסיסמה אופסה בהצלחה! ניתן להתחבר עם הסיסמה החדשה.
              </div>
              <button
                type="button"
                onClick={onDone}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                מעבר להתחברות
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">סיסמה חדשה</label>
                <input
                  className="input"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="לפחות 8 תווים"
                  autoComplete="new-password"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">אימות סיסמה</label>
                <input
                  className="input"
                  type="password"
                  required
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="הזינו שוב את הסיסמה"
                  autoComplete="new-password"
                  dir="ltr"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {loading ? "מאפס..." : "איפוס סיסמה"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Auth Screen (login / register / forgot) ──────────────────────────────────

function AuthScreen({ onAuth }: { onAuth: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "forgot") {
        const res = await fetch(`${API_URL}/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        if (!res.ok) {
          const d = (await res.json()) as { message?: string };
          throw new Error(d.message ?? "שגיאה");
        }
        setForgotSuccess(true);
        return;
      }

      if (mode === "register" && password.length < 8) {
        throw new Error("הסיסמה חייבת להכיל לפחות 8 תווים");
      }

      const body = mode === "login"
        ? { email, password }
        : { email, password, displayName };

      const res = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body)
      });

      const data = (await res.json()) as AuthUser & { message?: string };
      if (!res.ok) throw new Error(data.message ?? "שגיאה בהתחברות");

      onAuth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setForgotSuccess(false);
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white text-3xl mb-4">₪</div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">חשבונית IL</h1>
          <p className="mt-1 text-sm text-slate-500">מערכת הנהלת חשבונות ישראלית</p>
        </div>

        <div className="rounded-[28px] bg-white p-8 shadow-sm shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-950">

          {/* Tab bar — only for login/register */}
          {mode !== "forgot" && (
            <div className="flex gap-1 mb-6 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  mode === "login" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                התחברות
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  mode === "register" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                הרשמה
              </button>
            </div>
          )}

          {/* Forgot password heading */}
          {mode === "forgot" && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mb-3 text-sm text-slate-500 hover:text-slate-700"
              >
                ← חזרה להתחברות
              </button>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">שכחתי סיסמה</h2>
              <p className="mt-1 text-sm text-slate-500">הזינו את האימייל שלכם ונשלח קישור לאיפוס הסיסמה.</p>
            </div>
          )}

          {forgotSuccess ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                אם קיים חשבון עם כתובת זו, נשלח אליה קישור לאיפוס הסיסמה. בדקו את תיבת הדואר שלכם.
              </div>
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                חזרה להתחברות
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">שם לתצוגה</label>
                  <input
                    className="input"
                    type="text"
                    required
                    maxLength={100}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="שם מלא"
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">אימייל</label>
                <input
                  className="input"
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete={mode === "login" ? "username" : "email"}
                  dir="ltr"
                />
              </div>

              {mode !== "forgot" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">סיסמה</label>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={mode === "register" ? 8 : 1}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "לפחות 8 תווים" : "הסיסמה שלך"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    dir="ltr"
                  />
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {loading
                  ? "אנא המתן..."
                  : mode === "login"
                  ? "התחברות"
                  : mode === "register"
                  ? "יצירת חשבון"
                  : "שלח קישור לאיפוס"}
              </button>

              {mode === "login" && (
                <p className="text-center text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="underline hover:text-slate-700"
                  >
                    שכחתי את הסיסמה
                  </button>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

export default function AuthGate() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    // Check URL for reset token before checking session
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset_token");
    if (token) {
      setResetToken(token);
      setChecking(false);
      return;
    }

    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then(async (res) => {
        if (res.ok) setUser((await res.json()) as AuthUser);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function handleLogout() {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center dark:bg-slate-950">
        <div className="text-slate-500 text-sm dark:text-slate-400">טוען...</div>
      </div>
    );
  }

  if (resetToken) {
    return <ResetPasswordScreen token={resetToken} onDone={() => setResetToken(null)} />;
  }

  if (!user) {
    return <AuthScreen onAuth={setUser} />;
  }

  return <App user={user} onLogout={handleLogout} />;
}

