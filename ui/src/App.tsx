import { useCallback, useEffect, useMemo, useState } from "react";
import { LoginPage } from "./components/LoginPage";
import { PromoDrawer } from "./components/PromoDrawer";
import { TrackerTable } from "./components/TrackerTable";
import { TrackerToolbar } from "./components/TrackerToolbar";
import { UserManagement } from "./components/UserManagement";
import { deletePromo, getCurrentUser, getPromo, getPromos, logout, removePromoPartner, updateReportStatus } from "./shared/api/client";
import { removePartnerFromState, removePromoFromState } from "./shared/lib/admin";
import { filterPromos, getPartnerColumns, sortPromos } from "./shared/lib/tracker";
import type { CurrentUser, Filters, PromoDto } from "./types";

const initialFilters: Filters = { search: "", lob: "", status: "", partner: "" };
type Page = "tracker" | "users";

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [promos, setPromos] = useState<PromoDto[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState<Page>("tracker");
  const [selected, setSelected] = useState<PromoDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPromos = useCallback(async () => {
    setLoading(true);
    try { setPromos(await getPromos()); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { getCurrentUser().then((current) => { setUser(current); return loadPromos(); }).catch(() => setUser(null)).finally(() => setAuthLoading(false)); }, [loadPromos]);

  const partners = useMemo(() => getPartnerColumns(promos), [promos]);
  const visiblePromos = useMemo(() => {
    const filtered = filterPromos(promos, filters);
    return sortPromos(pendingOnly ? filtered.filter((promo) => promo.status === "finished" && promo.partners.some((partner) => !partner.reportReceived)) : filtered);
  }, [promos, filters, pendingOnly]);
  const pending = promos.reduce((count, promo) => count + (promo.status === "finished" ? promo.partners.filter((partner) => !partner.reportReceived).length : 0), 0);

  if (authLoading) return <main className="login-page">Завантаження…</main>;
  if (!user) return <LoginPage onLogin={(current) => { setUser(current); void loadPromos(); }} />;

  const selectPromo = async (id: string) => { try { setSelected(await getPromo(id)); } catch (reason) { setError((reason as Error).message); } };
  const toggleReport = async (id: string, received: boolean) => {
    setBusyId(id);
    try {
      const updated = await updateReportStatus(id, received);
      const apply = (promo: PromoDto) => ({ ...promo, partners: promo.partners.map((partner) => partner.promoPartnerId === id ? { ...partner, reportReceived: updated.reportReceived, reportReceivedAt: updated.reportReceivedAt } : partner) });
      setPromos((current) => current.map(apply));
      setSelected((current) => current ? apply(current) : null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  };
  const removePartner = async (promo: PromoDto, partnerId: string, partnerName: string) => {
    if (!window.confirm(`Видалити ${partnerName} з промо “${promo.name}”? Сам партнер залишиться в базі.`)) return;
    try { await removePromoPartner(promo.id, partnerId); setPromos((current) => removePartnerFromState(current, promo.id, partnerId)); setSelected((current) => current ? removePartnerFromState([current], promo.id, partnerId)[0] : null); }
    catch (reason) { setError((reason as Error).message); }
  };
  const removePromo = async (promo: PromoDto) => {
    if (!window.confirm(`Видалити промо “${promo.name}”? Усі пов’язані звіти партнерів також буде видалено.`)) return;
    try { await deletePromo(promo.id); setPromos((current) => removePromoFromState(current, promo.id)); setSelected(null); }
    catch (reason) { setError((reason as Error).message); }
  };
  const showAll = () => { setPage("tracker"); setPendingOnly(false); setFilters(initialFilters); };
  const signOut = () => void logout().finally(() => { setUser(null); setPromos([]); setSelected(null); setPage("tracker"); });

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span>PT</span>Promo Tracker</div>
      <nav aria-label="Основна навігація">
        <button className={page === "tracker" && !pendingOnly ? "active" : ""} onClick={showAll}>Огляд</button>
        <button onClick={showAll}>Усі промо</button>
        <button className={page === "tracker" && pendingOnly ? "active" : ""} onClick={() => { setPage("tracker"); setPendingOnly(true); setFilters(initialFilters); }}>Очікуються звіти <em>{pending}</em></button>
        <button onClick={showAll}>Партнери</button>
        {user.role === "SUPERUSER" && <button className={page === "users" ? "active" : ""} onClick={() => { setPage("users"); setSelected(null); }}>Користувачі</button>}
      </nav>
      <div className="account"><span>{user.email}</span><small>{user.role}</small><button onClick={signOut}>Вийти</button></div>
      <p>Telegram — канал додавання промо</p>
    </aside>
    <main>
      {page === "users" && user.role === "SUPERUSER" ? <UserManagement currentUser={user} onError={setError} /> : <>
        <header className="page-header"><div><span className="eyebrow">Робочий простір KAM</span><h1>Promo Tracker</h1><p>Промоактивності та звіти партнерів</p></div><div className="summary"><div><span>Активні</span><strong>{promos.filter((promo) => promo.status === "active").length}</strong></div><div><span>Заплановані</span><strong>{promos.filter((promo) => promo.status === "planned").length}</strong></div><div><span>Очікуються звіти</span><strong>{pending}</strong></div></div></header>
        <TrackerToolbar filters={filters} setFilters={setFilters} lobs={[...new Set(promos.map((promo) => promo.lob))].sort()} partners={partners} />
        {loading ? <div className="empty">Завантаження…</div> : promos.length === 0 ? <div className="empty">Промо ще не додані.</div> : <TrackerTable promos={visiblePromos} partners={partners} onSelect={selectPromo} />}
      </>}
    </main>
    {error && <div className="error app-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Закрити помилку">×</button></div>}
    {selected && <PromoDrawer promo={selected} user={user} busyId={busyId} onClose={() => setSelected(null)} onToggle={toggleReport} onDeletePromo={removePromo} onRemovePartner={removePartner} />}
  </div>;
}
