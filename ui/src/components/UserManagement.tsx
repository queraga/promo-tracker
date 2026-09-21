import { useEffect, useMemo, useReducer, useState, type FormEvent } from "react";
import { createUser, deleteUser, getAdminPartners, getUsers, replaceUserPartners, updateUser, updateUserPassword } from "../shared/api/client";
import type { AdminPartnerCatalogItem, CurrentUser, ManagedUser } from "../types";

type Props = { currentUser: CurrentUser; onCurrentUserChange: (user: ManagedUser) => void; onError: (message: string) => void };

export function assignmentKeysForUser(user: Pick<ManagedUser, "partners">, catalog: AdminPartnerCatalogItem[]): string[] {
  return user.partners.flatMap((partner) => catalog.find((item) => item.id === partner.id)?.key ?? catalog.find((item) => item.id === null && item.name === partner.name)?.key ?? []);
}

export const partnerKeysForRole = (role: CurrentUser["role"], keys: string[]) => role === "KAM" ? keys : [];
export const removeDeletedUser = (users: ManagedUser[], id: number) => users.filter((user) => user.id !== id);

export type UserDeleteState = { target: ManagedUser | null; busy: boolean };
export type UserDeleteAction = { type: "open"; user: ManagedUser } | { type: "cancel" | "success" } | { type: "start" | "failure" };
export const userDeleteReducer = (state: UserDeleteState, action: UserDeleteAction): UserDeleteState => {
  if (action.type === "open") return { target: action.user, busy: false };
  if (action.type === "cancel" || action.type === "success") return { target: null, busy: false };
  if (action.type === "start") return { ...state, busy: true };
  return { ...state, busy: false };
};

export function DeleteUserDialog({ state, onCancel, onConfirm }: { state: UserDeleteState; onCancel: () => void; onConfirm: () => void }) {
  if (!state.target) return null;
  return <div className="user-dialog-backdrop" role="presentation">
    <div className="user-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
      <h3 id="delete-user-title">Видалити користувача?</h3>
      <p>Користувача <strong>{state.target.email}</strong> буде видалено назавжди. Це не видалить партнерів або промо.</p>
      <div className="user-dialog-actions"><button type="button" className="reset" disabled={state.busy} onClick={onCancel}>Скасувати</button><button type="button" className="danger-button" disabled={state.busy} onClick={onConfirm}>{state.busy ? "Видалення…" : "Видалити"}</button></div>
    </div>
  </div>;
}

export function DeleteUserAction({ user, onOpen }: { user: ManagedUser; onOpen: (user: ManagedUser) => void }) {
  if (user.role !== "KAM") return null;
  return <button type="button" className="delete-user" onClick={() => onOpen(user)}>Видалити</button>;
}

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
  const [deleteState, dispatchDelete] = useReducer(userDeleteReducer, { target: null, busy: false });
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
  const confirmDelete = async () => {
    const target = deleteState.target;
    if (!target) return;
    dispatchDelete({ type: "start" });
    try { await deleteUser(target.id); setUsers((current) => removeDeletedUser(current, target.id)); dispatchDelete({ type: "success" }); }
    catch (reason) { dispatchDelete({ type: "failure" }); onError((reason as Error).message); }
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
      {user.role === "KAM" ? <><UserPartnerEditor user={user} catalog={catalog} onSaved={(partners) => setUsers((current) => current.map((item) => item.id === user.id ? { ...item, partners } : item))} onError={onError} /><DeleteUserAction user={user} onOpen={(target) => dispatchDelete({ type: "open", user: target })} /></> : <div className="superuser-scope"><span>Партнери</span><strong>Повний доступ</strong></div>}
    </article>)}</div>}
    <DeleteUserDialog state={deleteState} onCancel={() => dispatchDelete({ type: "cancel" })} onConfirm={() => void confirmDelete()} />
  </section>;
}
