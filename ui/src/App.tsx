import { useCallback, useEffect, useMemo, useState } from "react";
import { LoginPage } from "./components/LoginPage";
import { MobilePartnerFeed } from "./components/MobilePartnerFeed";
import { PromoDrawer } from "./components/PromoDrawer";
import { TrackerTable } from "./components/TrackerTable";
import { TrackerToolbar } from "./components/TrackerToolbar";
import { UserManagement } from "./components/UserManagement";
import { deletePromo, getCurrentUser, getPartners, getPromo, getPromos, logout, removePromoPartner, updateReportStatus } from "./shared/api/client";
import { removePartnerFromState, removePromoFromState } from "./shared/lib/admin";
import { filterPromos, getPartnerColumns, getVisiblePartnerColumns, sortPromos } from "./shared/lib/tracker";
import { readMobilePartner, readPartnerColumns, reconcileMobilePartner, reconcilePartnerColumns, reconcilePartnerFilter, writeMobilePartner, writePartnerColumns } from "./shared/lib/preferences";
import type { CurrentUser, Filters, ManagedUser, PromoDto } from "./types";

const initialFilters: Filters = { search: "", lob: "", status: "", partner: "" };
type Page = "tracker" | "users";

export function SidebarNavigation({ role, page, pendingOnly, pending, onOverview, onPending, onUsers }: { role: CurrentUser["role"]; page: Page; pendingOnly: boolean; pending: number; onOverview: () => void; onPending: () => void; onUsers: () => void }) {
  return <nav aria-label="Основна навігація">
    <button className={page === "tracker" && !pendingOnly ? "active" : ""} onClick={onOverview}>Огляд</button>
    <button className={page === "tracker" && pendingOnly ? "active" : ""} onClick={onPending}>Очікуються звіти <em>{pending}</em></button>
    {role === "SUPERUSER" && <button className={page === "users" ? "active" : ""} onClick={onUsers}>Користувачі</button>}
  </nav>;
}

export function DashboardSummary({ promos, pending }: { promos: PromoDto[]; pending: number }) {
  return <div className="summary">
    <div><span>Всього промо</span><strong>{promos.length}</strong></div>
    <div><span>Активні</span><strong>{promos.filter((promo) => promo.status === "active").length}</strong></div>
    <div><span>Очікуються звіти</span><strong>{pending}</strong></div>
  </div>;
}

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [promos, setPromos] = useState<PromoDto[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<string[] | null>(null);
  const [mobilePartner, setMobilePartner] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState<Page>("tracker");
  const [selected, setSelected] = useState<PromoDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async (currentUser: CurrentUser) => {
    setLoading(true);
    try {
      const [loadedPromos, loadedPartners] = await Promise.all([getPromos(), getPartners()]);
      setPromos(loadedPromos);
      setPartners(loadedPartners);
      setSelectedPartners(readPartnerColumns(window.localStorage, currentUser.id, loadedPartners));
      setMobilePartner(readMobilePartner(window.localStorage, currentUser.id, loadedPartners));
    }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { getCurrentUser().then((current) => { setUser(current); return loadWorkspace(current); }).catch(() => setUser(null)).finally(() => setAuthLoading(false)); }, [loadWorkspace]);

  const knownPartners = useMemo(() => partners.length ? partners : getPartnerColumns(promos), [partners, promos]);
  const visiblePartners = useMemo(() => getVisiblePartnerColumns(knownPartners, selectedPartners), [knownPartners, selectedPartners]);
  const filteredPromos = useMemo(() => filterPromos(promos, filters), [promos, filters]);
  const visiblePromos = useMemo(() => sortPromos(pendingOnly ? filteredPromos.filter((promo) => promo.status === "finished" && promo.partners.some((partner) => !partner.reportReceived)) : filteredPromos), [filteredPromos, pendingOnly]);
  const pending = promos.reduce((count, promo) => count + (promo.status === "finished" ? promo.partners.filter((partner) => !partner.reportReceived).length : 0), 0);

  if (authLoading) return <main className="login-page">Завантаження…</main>;
  if (!user) return <LoginPage onLogin={(current) => { setUser(current); void loadWorkspace(current); }} />;

  const selectPromo = async (id: string) => { try { setSelected(await getPromo(id)); } catch (reason) { setError((reason as Error).message); } };
  const refreshPartners = async () => {
    const available = await getPartners();
    setPartners(available);
    setSelectedPartners((current) => reconcilePartnerColumns(window.localStorage, user.id, current, available));
    setFilters((current) => ({ ...current, partner: reconcilePartnerFilter(current.partner, available) }));
    setMobilePartner((current) => reconcileMobilePartner(window.localStorage, user.id, current, available));
  };
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
    try { await removePromoPartner(promo.id, partnerId); setPromos((current) => removePartnerFromState(current, promo.id, partnerId)); setSelected((current) => current ? removePartnerFromState([current], promo.id, partnerId)[0] : null); await refreshPartners(); }
    catch (reason) { setError((reason as Error).message); }
  };
  const removePromo = async (promo: PromoDto) => {
    if (!window.confirm(`Видалити промо “${promo.name}”? Усі пов’язані звіти партнерів також буде видалено.`)) return;
    try { await deletePromo(promo.id); setPromos((current) => removePromoFromState(current, promo.id)); setSelected(null); await refreshPartners(); }
    catch (reason) { setError((reason as Error).message); }
  };
  const showAll = () => { setPage("tracker"); setPendingOnly(false); setFilters(initialFilters); };
  const updateSelectedPartners = (selection: string[] | null) => { setSelectedPartners(selection); writePartnerColumns(window.localStorage, user.id, selection); };
  const updateMobilePartner = (partner: string) => { setMobilePartner(partner); writeMobilePartner(window.localStorage, user.id, partner); };
  const signOut = () => void logout().finally(() => { setUser(null); setPromos([]); setPartners([]); setMobilePartner(""); setSelected(null); setPage("tracker"); });
  const updateCurrentUser = (updated: ManagedUser) => {
    if (!updated.isActive) { signOut(); return; }
    setUser({ id: updated.id, email: updated.email, role: updated.role });
    if (updated.role !== "SUPERUSER") setPage("tracker");
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span>PT</span>Promo Tracker</div>
      <SidebarNavigation role={user.role} page={page} pendingOnly={pendingOnly} pending={pending} onOverview={showAll} onPending={() => { setPage("tracker"); setPendingOnly(true); setFilters(initialFilters); }} onUsers={() => { setPage("users"); setSelected(null); }} />
      <div className="account"><span>{user.email}</span><small>{user.role}</small><button onClick={signOut}>Вийти</button></div>
      <a className="telegram-link" href="https://t.me/promo_tracker_kam_bot" target="_blank" rel="noreferrer">
        <span>Telegram — канал додавання промо</span>
        <strong>Promo Tracker v1.0 →</strong>
      </a>
    </aside>
    <main>
      {page === "users" && user.role === "SUPERUSER" ? <UserManagement currentUser={user} onCurrentUserChange={updateCurrentUser} onError={setError} /> : <>
        <header className="page-header"><div><span className="eyebrow">Робочий простір KAM</span><h1>Promo Tracker</h1><p>Промоактивності та звіти партнерів</p></div><DashboardSummary promos={promos} pending={pending} /></header>
        <TrackerToolbar filters={filters} setFilters={setFilters} lobs={[...new Set(promos.map((promo) => promo.lob))].sort()} partners={knownPartners} selectedPartners={selectedPartners} setSelectedPartners={updateSelectedPartners} />
        {loading ? <div className="empty">Завантаження…</div> : <>{promos.length === 0 ? <div className="empty desktop-empty">Промо ще не додані.</div> : <TrackerTable promos={visiblePromos} partners={visiblePartners} onSelect={selectPromo} />}<MobilePartnerFeed promos={filteredPromos} partners={knownPartners} selectedPartner={mobilePartner} pendingOnly={pendingOnly} onPartnerChange={updateMobilePartner} onSelect={selectPromo} /></>}
      </>}
    </main>
    {error && <div className="error app-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Закрити помилку">×</button></div>}
    {selected && <PromoDrawer promo={selected} user={user} busyId={busyId} onClose={() => setSelected(null)} onToggle={toggleReport} onDeletePromo={removePromo} onRemovePartner={removePartner} />}
  </div>;
}
