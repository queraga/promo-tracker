import { useEffect, useState, type FormEvent } from "react";
import { createUser, getUsers, updateUser, updateUserPassword } from "../shared/api/client";
import type { CurrentUser, ManagedUser } from "../types";

type Props = { currentUser: CurrentUser; onCurrentUserChange: (user: ManagedUser) => void; onError: (message: string) => void };

function PasswordReset({ user, onError }: { user: ManagedUser; onError: Props["onError"] }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setSaved(false);
    try { await updateUserPassword(user.id, password); setPassword(""); setSaved(true); }
    catch (reason) { onError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <form className="password-reset" onSubmit={submit}>
    <label><span>Новий пароль</span><input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setSaved(false); }} /></label>
    <button className="reset" disabled={busy}>{busy ? "Збереження…" : "Змінити пароль"}</button>
    {saved && <span className="saved" role="status">Збережено</span>}
  </form>;
}

export function UserManagement({ currentUser, onCurrentUserChange, onError }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CurrentUser["role"]>("KAM");
  const load = () => getUsers().then(setUsers).catch((reason) => onError((reason as Error).message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try { const user = await createUser(email, password, role); setUsers((current) => [...current, user].sort((a, b) => a.email.localeCompare(b.email))); setEmail(""); setPassword(""); setRole("KAM"); }
    catch (reason) { onError((reason as Error).message); }
  };
  const change = async (user: ManagedUser, update: { role?: CurrentUser["role"]; isActive?: boolean }) => {
    setBusyId(user.id);
    try { const updated = await updateUser(user.id, update); setUsers((current) => current.map((item) => item.id === updated.id ? updated : item)); if (updated.id === currentUser.id) onCurrentUserChange(updated); }
    catch (reason) { onError((reason as Error).message); }
    finally { setBusyId(null); }
  };

  return <section className="users-page" aria-labelledby="users-heading">
    <header><div><span className="eyebrow">SUPERUSER</span><h2 id="users-heading">Користувачі</h2><p>Доступ до внутрішнього робочого простору надає адміністратор.</p></div></header>
    <form className="user-create" onSubmit={create}>
      <h3>Новий користувач</h3>
      <label><span>Email</span><input type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label><span>Тимчасовий пароль</span><input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label><span>Роль</span><select value={role} onChange={(event) => setRole(event.target.value as CurrentUser["role"])}><option value="KAM">KAM</option><option value="SUPERUSER">SUPERUSER</option></select></label>
      <button type="submit">Створити користувача</button>
    </form>
    {loading ? <div className="empty">Завантаження…</div> : <div className="user-list">{users.map((user) => <article className={`user-card${user.isActive ? "" : " inactive"}`} key={user.id}>
      <div className="user-identity"><strong>{user.email}</strong><span>{user.isActive ? "Активний" : "Деактивований"}{user.id === currentUser.id ? " · Ви" : ""}</span></div>
      <label><span>Роль</span><select aria-label={`Роль ${user.email}`} disabled={busyId === user.id} value={user.role} onChange={(event) => void change(user, { role: event.target.value as CurrentUser["role"] })}><option value="KAM">KAM</option><option value="SUPERUSER">SUPERUSER</option></select></label>
      <button className={user.isActive ? "deactivate" : "activate"} disabled={busyId === user.id} onClick={() => void change(user, { isActive: !user.isActive })}>{user.isActive ? "Деактивувати" : "Активувати"}</button>
      <PasswordReset user={user} onError={onError} />
    </article>)}</div>}
  </section>;
}
