import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createUser, getAdminPartners, getUsers, replaceUserPartners, updateUser, updateUserPassword } from "../shared/api/client";
import type { AdminPartnerCatalogItem, CurrentUser, ManagedUser } from "../types";

type Props = { currentUser: CurrentUser; onCurrentUserChange: (user: ManagedUser) => void; onError: (message: string) => void };

export function assignmentKeysForUser(user: Pick<ManagedUser, "partners">, catalog: AdminPartnerCatalogItem[]): string[] {
  return user.partners.flatMap((partner) => catalog.find((item) => item.id === partner.id)?.key ?? catalog.find((item) => item.id === null && item.name === partner.name)?.key ?? []);
}

export const partnerKeysForRole = (role: CurrentUser["role"], keys: string[]) => role === "KAM" ? keys : [];

export function PartnerAssignmentSelector({ catalog, selected, onChange, label = "Партнери" }: { catalog: AdminPartnerCatalogItem[]; selected: string[]; onChange: (keys: string[]) => void; label?: string }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("uk");
  const options = catalog.filter((item) => !normalizedQuery || item.name.toLocaleLowerCase("uk").includes(normalizedQuery));
  const selectedItems = selected.flatMap((key) => catalog.find((item) => item.key === key) ?? []);
  const toggle = (key: string) => onChange(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);

  return <div className="assignment-control">
    <span className="assignment-label">{label}</span>
    <div className="assignment-chips">
      {selectedItems.length ? selectedItems.map((item) => <button type="button" className="assignment-chip" key={item.key} onClick={() => toggle(item.key)} aria-label={`Прибрати ${item.name}`}>{item.name}<span aria-hidden="true">×</span></button>) : <span className="assignment-none">Не призначено</span>}
    </div>
    <details className="assignment-selector">
      <summary>{selected.length ? `Обрано ${selected.length}` : "Обрати партнерів"}</summary>
      <div className="assignment-popover">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук партнера" aria-label="Пошук партнера" />
        {selected.length > 0 && <button type="button" className="clear-assignments" onClick={() => onChange([])}>Очистити</button>}
        <div className="assignment-options">
          {options.map((item) => <label key={item.key}><input type="checkbox" checked={selected.includes(item.key)} onChange={() => toggle(item.key)} /><span>{item.name}</span></label>)}
          {options.length === 0 && <span className="assignment-no-results">Нічого не знайдено</span>}
        </div>
      </div>
    </details>
  </div>;
}

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

function UserPartnerEditor({ user, catalog, onSaved, onError }: { user: ManagedUser; catalog: AdminPartnerCatalogItem[]; onSaved: (partners: ManagedUser["partners"]) => void; onError: Props["onError"] }) {
  const initial = useMemo(() => assignmentKeysForUser(user, catalog), [user.partners, catalog]);
  const [selected, setSelected] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSelected(initial), [initial]);
  const save = async () => {
    setBusy(true);
    try { onSaved((await replaceUserPartners(user.id, selected)).partners); }
    catch (reason) { onError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="user-partners">
    <PartnerAssignmentSelector catalog={catalog} selected={selected} onChange={setSelected} />
    <button type="button" className="reset" disabled={busy || selected.join("\0") === initial.join("\0")} onClick={() => void save()}>{busy ? "Збереження…" : "Зберегти партнерів"}</button>
  </div>;
}

export function UserManagement({ currentUser, onCurrentUserChange, onError }: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [catalog, setCatalog] = useState<AdminPartnerCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CurrentUser["role"]>("KAM");
  const [partnerKeys, setPartnerKeys] = useState<string[]>([]);
  const load = () => Promise.all([getUsers(), getAdminPartners()]).then(([loadedUsers, loadedCatalog]) => { setUsers(loadedUsers); setCatalog(loadedCatalog); }).catch((reason) => onError((reason as Error).message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try { const user = await createUser(email, password, role, partnerKeysForRole(role, partnerKeys)); setUsers((current) => [...current, user].sort((a, b) => a.email.localeCompare(b.email))); setEmail(""); setPassword(""); setRole("KAM"); setPartnerKeys([]); }
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
      <label><span>Роль</span><select value={role} onChange={(event) => { const nextRole = event.target.value as CurrentUser["role"]; setRole(nextRole); if (nextRole === "SUPERUSER") setPartnerKeys([]); }}><option value="KAM">KAM</option><option value="SUPERUSER">SUPERUSER</option></select></label>
      {role === "KAM" && <PartnerAssignmentSelector catalog={catalog} selected={partnerKeys} onChange={setPartnerKeys} />}
      <button type="submit">Створити користувача</button>
    </form>
    {loading ? <div className="empty">Завантаження…</div> : <div className="user-list">{users.map((user) => <article className={`user-card${user.isActive ? "" : " inactive"}`} key={user.id}>
      <div className="user-card-main">
        <div className="user-identity"><strong>{user.email}</strong><span>{user.isActive ? "Активний" : "Деактивований"}{user.id === currentUser.id ? " · Ви" : ""}</span></div>
        <label><span>Роль</span><select aria-label={`Роль ${user.email}`} disabled={busyId === user.id} value={user.role} onChange={(event) => void change(user, { role: event.target.value as CurrentUser["role"] })}><option value="KAM">KAM</option><option value="SUPERUSER">SUPERUSER</option></select></label>
        <button className={user.isActive ? "deactivate" : "activate"} disabled={busyId === user.id} onClick={() => void change(user, { isActive: !user.isActive })}>{user.isActive ? "Деактивувати" : "Активувати"}</button>
        <PasswordReset user={user} onError={onError} />
      </div>
      {user.role === "KAM" ? <UserPartnerEditor user={user} catalog={catalog} onSaved={(partners) => setUsers((current) => current.map((item) => item.id === user.id ? { ...item, partners } : item))} onError={onError} /> : <div className="superuser-scope"><span>Партнери</span><strong>Повний доступ</strong></div>}
    </article>)}</div>}
  </section>;
}
