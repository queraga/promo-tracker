import { useState, type FormEvent } from "react";
import { login } from "../shared/api/client";
import type { CurrentUser } from "../types";

export function LoginPage({ onLogin }: { onLogin: (user: CurrentUser) => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { onLogin(await login(email, password)); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } };
  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="brand"><span>PT</span>Promo Tracker</div><h1>Вхід</h1><p>Увійдіть, щоб відкрити трекер промо.</p><label><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Пароль</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="login-error" role="alert">{error}</div>}<button type="submit" disabled={busy}>{busy ? "Вхід…" : "Увійти"}</button></form></main>;
}
