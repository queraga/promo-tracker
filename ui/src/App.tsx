import { useCallback, useEffect, useMemo, useState } from "react";
import { LoginPage } from "./components/LoginPage";
import { MobilePartnerFeed } from "./components/MobilePartnerFeed";
import { ProductBrand } from "./components/ProductBrand";
import { PromoDrawer } from "./components/PromoDrawer";
import { TrackerTable } from "./components/TrackerTable";
import { TrackerToolbar } from "./components/TrackerToolbar";
import { UserManagement } from "./components/UserManagement";
import { QuarterlyReporting } from "./components/QuarterlyReporting";
import { ArchivePage } from "./components/ArchivePage";
import { deletePromo, getCurrentUser, getPartners, getPromo, getPromos, logout, removePromoPartner, updateReportStatus } from "./shared/api/client";
import { removePartnerFromState, removePromoFromState } from "./shared/lib/admin";
import { countPendingReports, createDefaultFilters, filterPromos, getCurrentQuarter, getWorkspaceEmptyMessage, getWorkspacePartnerOptions, getWorkspaceQuarterOptions, getVisiblePartnerOptions, hasPendingReport, reconcileQuarterSelection, sortPromos } from "./shared/lib/tracker";
import { readDashboardPartners, reconcileDashboardPartners, writeDashboardPartners } from "./shared/lib/preferences";
import type { CurrentUser, Filters, ManagedUser, PromoDto, ProlongPromoResult, ScopedProlongationResult } from "./types";

type Page = "tracker" | "users" | "quarterly" | "archive";
export const replaceWorkspacePromo = (promos: PromoDto[], updated: PromoDto) => promos.map((promo) => promo.id === updated.id ? updated : promo);
export const applyProlongationResult = (promos: PromoDto[], result: ProlongPromoResult) => result.kind === "extended" ? replaceWorkspacePromo(promos, result.promo) : [...replaceWorkspacePromo(promos, result.currentPromo), result.continuationPromo];
export const scopedProlongationSuccessMessage = (result: ScopedProlongationResult) => result.kind === "split" ? "Промо успішно продовжено та розділено за кварталами." : "Промо успішно продовжено.";
export async function completeScopedProlongation(result: ScopedProlongationResult, user: CurrentUser, loadWorkspace: (currentUser: CurrentUser) => Promise<void>, closeDrawer: () => void, showNotice: (message: string) => void) {
  closeDrawer();
  await loadWorkspace(user);
  showNotice(scopedProlongationSuccessMessage(result));
}

export function SidebarNavigation({ role, page, pendingOnly, pending, onOverview, onPending, onUsers, onQuarterly, onArchive }: { role: CurrentUser["role"]; page: Page; pendingOnly: boolean; pending: number; onOverview: () => void; onPending: () => void; onUsers: () => void; onQuarterly: () => void; onArchive: () => void }) {
  return <nav aria-label="Основна навігація">
    <button className={page === "tracker" && !pendingOnly ? "active" : ""} onClick={onOverview}>Огляд</button>
    <button className={page === "tracker" && pendingOnly ? "active" : ""} onClick={onPending}>Очікуються звіти <em>{pending}</em></button>
    {(role === "PLM" || role === "SUPERUSER") && <button className={page === "quarterly" ? "active" : ""} onClick={onQuarterly}>Квартальна звітність</button>}
    {(role === "PLM" || role === "SUPERUSER") && <button className={page === "archive" ? "active" : ""} onClick={onArchive}>Архів</button>}
    {role === "SUPERUSER" && <button className={page === "users" ? "active" : ""} onClick={onUsers}>Користувачі</button>}
  </nav>;
}

export function DashboardSummary({ promos, selectedPartnerIds }: { promos: PromoDto[]; selectedPartnerIds: string[] | null }) {
  return <div className="summary">
    <div><span>Всього промо</span><strong>{promos.length}</strong></div>
    <div><span>Активні</span><strong>{promos.filter((promo) => promo.status === "active").length}</strong></div>
    <div><span>Очікуються звіти</span><strong>{countPendingReports(promos, selectedPartnerIds)}</strong></div>
  </div>;
}

export function UnassignedKamWorkspace() {
  return <div className="empty unassigned-workspace"><div><strong>Партнерів ще не призначено</strong><span>Зверніться до адміністратора для отримання доступу.</span></div></div>;
}

export const isUnassignedKamWorkspace = (role: CurrentUser["role"], partners: string[], loading: boolean) => role === "KAM" && !loading && partners.length === 0;

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [promos, setPromos] = useState<PromoDto[]>([]);
  const [partners, setPartners] = useState<string[]>([]);
  const [currentQuarter, setCurrentQuarter] = useState(() => getCurrentQuarter());
  const [filters, setFilters] = useState<Filters>(() => createDefaultFilters());
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState<Page>("tracker");
  const [selected, setSelected] = useState<PromoDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async (currentUser: CurrentUser) => {
    setLoading(true);
    try {
      const [loadedPromos, loadedPartners] = await Promise.all([getPromos(), getPartners()]);
      const latestQuarter = getCurrentQuarter(new Date());
      const partnerOptions = getWorkspacePartnerOptions(loadedPromos, loadedPartners);
      setCurrentQuarter(latestQuarter);
      setPromos(loadedPromos);
      setPartners(loadedPartners);
      setFilters((current) => ({ ...current, partners: readDashboardPartners(window.localStorage, currentUser.id, partnerOptions) }));
    }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { getCurrentUser().then((current) => { setUser(current); return loadWorkspace(current); }).catch(() => setUser(null)).finally(() => setAuthLoading(false)); }, [loadWorkspace]);

  const partnerOptions = useMemo(() => getWorkspacePartnerOptions(promos, partners), [promos, partners]);
  const quarterOptions = useMemo(() => getWorkspaceQuarterOptions(promos, currentQuarter), [promos, currentQuarter]);
  const visiblePartners = useMemo(() => getVisiblePartnerOptions(partnerOptions, filters.partners), [partnerOptions, filters.partners]);
  const filteredPromos = useMemo(() => filterPromos(promos, filters), [promos, filters]);
  const visiblePromos = useMemo(() => sortPromos(pendingOnly ? filteredPromos.filter((promo) => hasPendingReport(promo, filters.partners)) : filteredPromos), [filteredPromos, filters.partners, pendingOnly]);
  const pending = countPendingReports(promos);

  useEffect(() => {
    setFilters((current) => ({ ...current, quarter: reconcileQuarterSelection(current.quarter, quarterOptions, currentQuarter) }));
  }, [currentQuarter, quarterOptions]);

  if (authLoading) return <main className="login-page">Завантаження…</main>;
  if (!user) return <LoginPage onLogin={(current) => { setUser(current); void loadWorkspace(current); }} />;

  const selectPromo = async (id: string) => { try { setSelected(await getPromo(id)); } catch (reason) { setError((reason as Error).message); } };
  const resetFilters = () => {
    const now = new Date();
    const latestQuarter = getCurrentQuarter(now);
    setCurrentQuarter(latestQuarter);
    setFilters(createDefaultFilters(now));
    writeDashboardPartners(window.localStorage, user.id, null);
  };
  const refreshPartners = async (workspacePromos: PromoDto[] = promos) => {
    const available = await getPartners();
    setPartners(available);
    const options = getWorkspacePartnerOptions(workspacePromos, available);
    setFilters((current) => ({ ...current, partners: reconcileDashboardPartners(window.localStorage, user.id, current.partners, options) }));
  };
  const toggleReport = async (id: string, received: boolean) => {
    setBusyId(id);
    try {
      const updated = await updateReportStatus(id, received);
      const apply = (promo: PromoDto) => ({ ...promo, partners: promo.partners.map((partner) => partner.promoPartnerId === id ? { ...partner, reportReceived: updated.reportReceived, reportReceivedAt: updated.reportReceivedAt } : partner) });
      setPromos((current) => current.map(apply));
      setSelected((current) => current ? apply(current) : null);
    } catch (reason) { setError((reason as Error).message); await loadWorkspace(user); }
    finally { setBusyId(null); }
  };
  const applyExpandedPromo = async (updated: PromoDto) => {
    const nextPromos = replaceWorkspacePromo(promos, updated);
    setPromos(nextPromos);
    setSelected(updated);
    await refreshPartners(nextPromos);
  };
  const applyProlongation = async (result: ProlongPromoResult) => {
    const nextPromos = applyProlongationResult(promos, result);
    setPromos(nextPromos);
    setSelected(null);
    await refreshPartners(nextPromos);
  };
  const applyScopedProlongation = async (result: ScopedProlongationResult) => {
    await completeScopedProlongation(result, user, loadWorkspace, () => setSelected(null), setNotice);
  };
  const removePartner = async (promo: PromoDto, partnerId: string, partnerName: string) => {
    if (!window.confirm(`Видалити ${partnerName} з промо “${promo.name}”? Сам партнер залишиться в базі.`)) return;
    try { await removePromoPartner(promo.id, partnerId); const nextPromos = removePartnerFromState(promos, promo.id, partnerId); setPromos(nextPromos); setSelected((current) => current ? removePartnerFromState([current], promo.id, partnerId)[0] : null); await refreshPartners(nextPromos); }
    catch (reason) { setError((reason as Error).message); }
  };
  const removePromo = async (promo: PromoDto) => {
    if (!window.confirm(`Видалити промо “${promo.name}”? Усі пов’язані звіти партнерів також буде видалено.`)) return;
    try { await deletePromo(promo.id); const nextPromos = removePromoFromState(promos, promo.id); setPromos(nextPromos); setSelected(null); await refreshPartners(nextPromos); }
    catch (reason) { setError((reason as Error).message); }
  };
  const showAll = () => { setPage("tracker"); setPendingOnly(false); resetFilters(); };
  const updateSelectedPartners = (selection: string[] | null) => {
    setFilters((current) => ({ ...current, partners: selection }));
    writeDashboardPartners(window.localStorage, user.id, selection);
  };
  const signOut = () => void logout().finally(() => { setUser(null); setPromos([]); setPartners([]); setFilters(createDefaultFilters()); setSelected(null); setPage("tracker"); });
  const updateCurrentUser = (updated: ManagedUser) => {
    if (!updated.isActive) { signOut(); return; }
    const nextUser = { id: updated.id, email: updated.email, role: updated.role };
    setUser(nextUser);
    if (updated.role !== "SUPERUSER") setPage("tracker");
    if (updated.id === user.id && updated.role !== user.role) {
      setPromos([]);
      setPartners([]);
      setFilters(createDefaultFilters());
      setCurrentQuarter(getCurrentQuarter());
      setPage("tracker");
      void loadWorkspace(nextUser);
    }
  };

  return <div className="shell">
    <aside className="sidebar">
      <ProductBrand />
      <SidebarNavigation role={user.role} page={page} pendingOnly={pendingOnly} pending={pending} onOverview={showAll} onPending={() => { setPage("tracker"); setPendingOnly(true); resetFilters(); }} onUsers={() => { setPage("users"); setSelected(null); }} onQuarterly={() => { setPage("quarterly"); setSelected(null); }} onArchive={() => { setPage("archive"); setSelected(null); }} />
      <div className="account"><span>{user.email}</span><small>{user.role}</small><button onClick={signOut}>Вийти</button></div>
      <a className="telegram-link" href="https://t.me/promo_tracker_kam_bot" target="_blank" rel="noreferrer">
        <span>Telegram — канал додавання промо</span>
        <strong>Promo Tracker v1.0 →</strong>
      </a>
    </aside>
    <main>
      {page === "users" && user.role === "SUPERUSER" ? <UserManagement currentUser={user} onCurrentUserChange={updateCurrentUser} onError={setError} /> : page === "quarterly" && (user.role === "PLM" || user.role === "SUPERUSER") ? <QuarterlyReporting user={user} onClosed={() => void loadWorkspace(user)} onError={setError} /> : page === "archive" && (user.role === "PLM" || user.role === "SUPERUSER") ? <ArchivePage onError={setError} /> : <>
        <header className="page-header"><div><span className="eyebrow">Робочий простір {user.role}</span><h1>Promo Tracker</h1><p>Промоактивності та звіти партнерів</p></div><DashboardSummary promos={visiblePromos} selectedPartnerIds={filters.partners} /></header>
        {loading ? <div className="empty">Завантаження…</div> : isUnassignedKamWorkspace(user.role, partners, loading) ? <UnassignedKamWorkspace /> : <>
          <TrackerToolbar filters={filters} setFilters={setFilters} lobs={[...new Set(promos.map((promo) => promo.lob))].sort()} quarters={quarterOptions} partners={partnerOptions} onPartnersChange={updateSelectedPartners} onReset={resetFilters} />
          {promos.length === 0 ? <div className="empty desktop-empty">Промо ще не додані.</div> : visiblePromos.length === 0 ? <div className="empty desktop-empty">{getWorkspaceEmptyMessage(promos, filters, pendingOnly)}</div> : <TrackerTable promos={visiblePromos} partners={visiblePartners} onSelect={selectPromo} />}
          <MobilePartnerFeed promos={visiblePromos} partners={partnerOptions} selectedPartners={filters.partners} pendingOnly={pendingOnly} onSelect={selectPromo} />
        </>}
      </>}
    </main>
    {error && <div className="error app-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Закрити помилку">×</button></div>}
    {notice && <div className="success app-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Закрити повідомлення">×</button></div>}
    {selected && <PromoDrawer promo={selected} user={user} busyId={busyId} onClose={() => setSelected(null)} onToggle={toggleReport} onDeletePromo={removePromo} onRemovePartner={removePartner} onExpanded={(updated) => void applyExpandedPromo(updated)} onProlonged={(result) => void applyProlongation(result)} onScopedProlonged={(result) => void applyScopedProlongation(result)} onError={setError} />}
  </div>;
}
