import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import App from "./App";
const API_URL = import.meta.env.VITE_API_URL ?? "";
// ─── Reset Password Screen ────────────────────────────────────────────────────
function ResetPasswordScreen({ token, onDone }) {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    async function handleSubmit(e) {
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
            const data = (await res.json());
            if (!res.ok)
                throw new Error(data.message ?? "שגיאה באיפוס הסיסמה");
            setSuccess(true);
            // Remove token from URL without page reload
            window.history.replaceState({}, "", window.location.pathname);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("main", { className: "min-h-screen bg-slate-100 flex items-center justify-center p-6 dark:bg-slate-950 dark:text-slate-100", children: _jsxs("div", { className: "w-full max-w-md", children: [_jsxs("div", { className: "mb-8 text-center", children: [_jsx("div", { className: "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white text-3xl mb-4", children: "\u20AA" }), _jsx("h1", { className: "text-2xl font-bold text-slate-900 dark:text-white", children: "\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA IL" })] }), _jsxs("div", { className: "rounded-[28px] bg-white p-8 shadow-sm shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-950", children: [_jsx("h2", { className: "mb-1 text-lg font-semibold text-slate-900 dark:text-white", children: "\u05D0\u05D9\u05E4\u05D5\u05E1 \u05E1\u05D9\u05E1\u05DE\u05D4" }), _jsx("p", { className: "mb-5 text-sm text-slate-500", children: "\u05D1\u05D7\u05E8\u05D5 \u05E1\u05D9\u05E1\u05DE\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05DC\u05D7\u05E9\u05D1\u05D5\u05DF \u05E9\u05DC\u05DB\u05DD." }), success ? (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700", children: "\u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05D0\u05D5\u05E4\u05E1\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4! \u05E0\u05D9\u05EA\u05DF \u05DC\u05D4\u05EA\u05D7\u05D1\u05E8 \u05E2\u05DD \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4 \u05D4\u05D7\u05D3\u05E9\u05D4." }), _jsx("button", { type: "button", onClick: onDone, className: "w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700", children: "\u05DE\u05E2\u05D1\u05E8 \u05DC\u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA" })] })) : (_jsxs("form", { className: "space-y-4", onSubmit: handleSubmit, children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5", children: "\u05E1\u05D9\u05E1\u05DE\u05D4 \u05D7\u05D3\u05E9\u05D4" }), _jsx("input", { className: "input", type: "password", required: true, minLength: 8, maxLength: 128, value: newPassword, onChange: (e) => setNewPassword(e.target.value), placeholder: "\u05DC\u05E4\u05D7\u05D5\u05EA 8 \u05EA\u05D5\u05D5\u05D9\u05DD", autoComplete: "new-password", dir: "ltr" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5", children: "\u05D0\u05D9\u05DE\u05D5\u05EA \u05E1\u05D9\u05E1\u05DE\u05D4" }), _jsx("input", { className: "input", type: "password", required: true, maxLength: 128, value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), placeholder: "\u05D4\u05D6\u05D9\u05E0\u05D5 \u05E9\u05D5\u05D1 \u05D0\u05EA \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4", autoComplete: "new-password", dir: "ltr" })] }), error && (_jsx("div", { className: "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700", children: error })), _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60", children: loading ? "מאפס..." : "איפוס סיסמה" })] }))] })] }) }));
}
// ─── Auth Screen (login / register / forgot) ──────────────────────────────────
function AuthScreen({ onAuth }) {
    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [forgotSuccess, setForgotSuccess] = useState(false);
    async function handleSubmit(e) {
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
                    const d = (await res.json());
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
            const text = await res.text();
            const data = text ? JSON.parse(text) : {};
            if (!res.ok)
                throw new Error(data.message ?? `שגיאה בהתחברות (${res.status})`);
            onAuth(data);
        }
        catch (err) {
            if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
                setError("לא ניתן להתחבר לשרת. בדקו שה-API פועל.");
            }
            else {
                setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
            }
        }
        finally {
            setLoading(false);
        }
    }
    function switchMode(next) {
        setMode(next);
        setError(null);
        setForgotSuccess(false);
    }
    return (_jsx("main", { className: "min-h-screen bg-slate-100 flex items-center justify-center p-6 dark:bg-slate-950 dark:text-slate-100", children: _jsxs("div", { className: "w-full max-w-md", children: [_jsxs("div", { className: "mb-8 text-center", children: [_jsx("div", { className: "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-white text-3xl mb-4", children: "\u20AA" }), _jsx("h1", { className: "text-2xl font-bold text-slate-900 dark:text-white", children: "\u05D7\u05E9\u05D1\u05D5\u05E0\u05D9\u05EA IL" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "\u05DE\u05E2\u05E8\u05DB\u05EA \u05D4\u05E0\u05D4\u05DC\u05EA \u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA \u05D9\u05E9\u05E8\u05D0\u05DC\u05D9\u05EA" })] }), _jsxs("div", { className: "rounded-[28px] bg-white p-8 shadow-sm shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-950", children: [mode !== "forgot" && (_jsxs("div", { className: "flex gap-1 mb-6 rounded-xl bg-slate-100 p-1 dark:bg-slate-900", children: [_jsx("button", { type: "button", onClick: () => switchMode("login"), className: `flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-600 hover:text-slate-900"}`, children: "\u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA" }), _jsx("button", { type: "button", onClick: () => switchMode("register"), className: `flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100" : "text-slate-600 hover:text-slate-900"}`, children: "\u05D4\u05E8\u05E9\u05DE\u05D4" })] })), mode === "forgot" && (_jsxs("div", { className: "mb-5", children: [_jsx("button", { type: "button", onClick: () => switchMode("login"), className: "mb-3 text-sm text-slate-500 hover:text-slate-700", children: "\u2190 \u05D7\u05D6\u05E8\u05D4 \u05DC\u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA" }), _jsx("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white", children: "\u05E9\u05DB\u05D7\u05EA\u05D9 \u05E1\u05D9\u05E1\u05DE\u05D4" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "\u05D4\u05D6\u05D9\u05E0\u05D5 \u05D0\u05EA \u05D4\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC \u05E9\u05DC\u05DB\u05DD \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E7\u05D9\u05E9\u05D5\u05E8 \u05DC\u05D0\u05D9\u05E4\u05D5\u05E1 \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4." })] })), forgotSuccess ? (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700", children: "\u05D0\u05DD \u05E7\u05D9\u05D9\u05DD \u05D7\u05E9\u05D1\u05D5\u05DF \u05E2\u05DD \u05DB\u05EA\u05D5\u05D1\u05EA \u05D6\u05D5, \u05E0\u05E9\u05DC\u05D7 \u05D0\u05DC\u05D9\u05D4 \u05E7\u05D9\u05E9\u05D5\u05E8 \u05DC\u05D0\u05D9\u05E4\u05D5\u05E1 \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4. \u05D1\u05D3\u05E7\u05D5 \u05D0\u05EA \u05EA\u05D9\u05D1\u05EA \u05D4\u05D3\u05D5\u05D0\u05E8 \u05E9\u05DC\u05DB\u05DD." }), _jsx("button", { type: "button", onClick: () => switchMode("login"), className: "w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50", children: "\u05D7\u05D6\u05E8\u05D4 \u05DC\u05D4\u05EA\u05D7\u05D1\u05E8\u05D5\u05EA" })] })) : (_jsxs("form", { className: "space-y-4", onSubmit: handleSubmit, children: [mode === "register" && (_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5", children: "\u05E9\u05DD \u05DC\u05EA\u05E6\u05D5\u05D2\u05D4" }), _jsx("input", { className: "input", type: "text", required: true, maxLength: 100, value: displayName, onChange: (e) => setDisplayName(e.target.value), placeholder: "\u05E9\u05DD \u05DE\u05DC\u05D0", autoComplete: "name" })] })), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5", children: "\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC" }), _jsx("input", { className: "input", type: "email", required: true, maxLength: 254, value: email, onChange: (e) => setEmail(e.target.value), placeholder: "your@email.com", autoComplete: mode === "login" ? "username" : "email", dir: "ltr" })] }), mode !== "forgot" && (_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5", children: "\u05E1\u05D9\u05E1\u05DE\u05D4" }), _jsx("input", { className: "input", type: "password", required: true, minLength: mode === "register" ? 8 : 1, maxLength: 128, value: password, onChange: (e) => setPassword(e.target.value), placeholder: mode === "register" ? "לפחות 8 תווים" : "הסיסמה שלך", autoComplete: mode === "login" ? "current-password" : "new-password", dir: "ltr" })] })), error && (_jsx("div", { className: "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700", children: error })), _jsx("button", { type: "submit", disabled: loading, className: "w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60", children: loading
                                        ? "אנא המתן..."
                                        : mode === "login"
                                            ? "התחברות"
                                            : mode === "register"
                                                ? "יצירת חשבון"
                                                : "שלח קישור לאיפוס" }), mode === "login" && (_jsx("p", { className: "text-center text-xs text-slate-500", children: _jsx("button", { type: "button", onClick: () => switchMode("forgot"), className: "underline hover:text-slate-700", children: "\u05E9\u05DB\u05D7\u05EA\u05D9 \u05D0\u05EA \u05D4\u05E1\u05D9\u05E1\u05DE\u05D4" }) }))] }))] })] }) }));
}
// ─── Auth Gate ────────────────────────────────────────────────────────────────
export default function AuthGate() {
    const [user, setUser] = useState(null);
    const [checking, setChecking] = useState(true);
    const [resetToken, setResetToken] = useState(null);
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
            if (res.ok)
                setUser((await res.json()));
        })
            .catch(() => { })
            .finally(() => setChecking(false));
    }, []);
    async function handleLogout() {
        await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
        setUser(null);
    }
    if (checking) {
        return (_jsx("div", { className: "min-h-screen bg-slate-100 flex items-center justify-center dark:bg-slate-950", children: _jsx("div", { className: "text-slate-500 text-sm dark:text-slate-400", children: "\u05D8\u05D5\u05E2\u05DF..." }) }));
    }
    if (resetToken) {
        return _jsx(ResetPasswordScreen, { token: resetToken, onDone: () => setResetToken(null) });
    }
    if (!user) {
        return _jsx(AuthScreen, { onAuth: setUser });
    }
    return _jsx(App, { user: user, onLogout: handleLogout });
}
