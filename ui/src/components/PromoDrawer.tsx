import { useEffect, useState } from "react";
import type { CurrentUser, PromoDto, PromoPartnerOption, PromoStatus } from "../types";
import { addPromoPartners, getPromoPartnerOptions } from "../shared/api/client";
import { canExpandPromoPartners, canManagePromos, canMutateReports } from "../shared/lib/admin";

const labels: Record<PromoStatus, string> = { active: "Активне", planned: "Заплановане", finished: "Завершене" };
const formatDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
export const availablePartnerOptions = (options: PromoPartnerOption[]) => options.filter((option) => !option.alreadyAssociated);
export const togglePartnerSelection = (selected: string[], id: string) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
export const selectAllAvailablePartners = (options: PromoPartnerOption[]) => availablePartnerOptions(options).map(({ id }) => id);

type ExpansionDialogProps = { options: PromoPartnerOption[]; selected: string[]; loading: boolean; submitting: boolean; onToggle: (id: string) => void; onSelectAll: () => void; onCancel: () => void; onAdd: () => void };
export function PartnerExpansionDialog({ options, selected, loading, submitting, onToggle, onSelectAll, onCancel, onAdd }: ExpansionDialogProps) {
  const available = availablePartnerOptions(options);
  return <div className="partner-dialog-backdrop" role="presentation"><div className="partner-dialog" role="dialog" aria-modal="true" aria-labelledby="partner-dialog-title">
    <h3 id="partner-dialog-title">Додати промо партнерам</h3>
    {loading ? <div className="partner-dialog-empty">Завантаження…</div> : available.length === 0 ? <div className="partner-dialog-empty">Усі доступні партнери вже додані до промо.</div> : <>
      <div className="partner-dialog-options">{options.map((option) => <label key={option.id} className={option.alreadyAssociated ? "already-added" : ""}><input type="checkbox" checked={option.alreadyAssociated || selected.includes(option.id)} disabled={option.alreadyAssociated || submitting} onChange={() => onToggle(option.id)} /><span>{option.name}</span>{option.alreadyAssociated && <small>вже додано</small>}</label>)}</div>
      <button type="button" className="select-available" disabled={submitting} onClick={onSelectAll}>Обрати всіх доступних</button>
    </>}
    <div className="partner-dialog-actions"><button type="button" className="reset" disabled={submitting} onClick={onCancel}>Скасувати</button><button type="button" disabled={loading || submitting || selected.length === 0} onClick={onAdd}>{submitting ? "Додавання…" : "Додати"}</button></div>
  </div></div>;
}

type Props = { promo: PromoDto; user: CurrentUser; busyId: string | null; onClose: () => void; onToggle: (id: string, received: boolean) => void; onDeletePromo: (promo: PromoDto) => void; onRemovePartner: (promo: PromoDto, partnerId: string, partnerName: string) => void; onExpanded: (promo: PromoDto) => void; onError: (message: string) => void };
export function PromoDrawer({ promo, user, busyId, onClose, onToggle, onDeletePromo, onRemovePartner, onExpanded, onError }: Props) {
  const [expanding, setExpanding] = useState(false);
  const [options, setOptions] = useState<PromoPartnerOption[]>([]);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") expanding ? setExpanding(false) : onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [expanding, onClose]);
  const superuser = canManagePromos(user);
  const canExpand = canExpandPromoPartners(user);
  const canReport = canMutateReports(user);
  const openExpansion = async () => {
    setExpanding(true); setLoadingOptions(true); setSelectedPartnerIds([]);
    try { setOptions(await getPromoPartnerOptions(promo.id)); }
    catch (reason) { setExpanding(false); onError((reason as Error).message); }
    finally { setLoadingOptions(false); }
  };
  const addPartners = async () => {
    setSubmitting(true);
    try { const updated = await addPromoPartners(promo.id, selectedPartnerIds); onExpanded(updated); setExpanding(false); setSelectedPartnerIds([]); }
    catch (reason) { onError((reason as Error).message); }
    finally { setSubmitting(false); }
  };
  return <><button className="drawer-backdrop" aria-label="Закрити деталі" onClick={onClose} /><aside className="drawer" aria-label="Деталі промо"><header><div><span className="eyebrow">{promo.lob}</span><h2>{promo.name}</h2></div><button className="close" onClick={onClose} aria-label="Закрити">×</button></header>
    <dl className="details"><div><dt>Період</dt><dd>{formatDate(promo.startDate)} — {formatDate(promo.endDate)}</dd></div><div><dt>Статус</dt><dd><span className={`badge ${promo.status}`}>{labels[promo.status]}</span></dd></div></dl>
    <section><div className="drawer-section-heading"><h3>Партнери</h3>{canExpand && <button type="button" className="add-partners" onClick={() => void openExpansion()}>Додати партнерів</button>}</div>{promo.partners.map((partner) => <article className="partner-detail" key={partner.promoPartnerId}><div className="partner-row"><div><strong>{partner.partnerName}</strong><span>{partner.reportReceived ? "Звіт отримано" : promo.status === "finished" ? "Очікується звіт" : "Звіт ще не очікується"}</span></div><div className="partner-actions">{canReport && <button disabled={busyId === partner.promoPartnerId} className={partner.reportReceived ? "report received" : "report"} onClick={() => onToggle(partner.promoPartnerId, !partner.reportReceived)}>{partner.reportReceived ? "✓ Отримано" : "Позначити отриманим"}</button>}{superuser && <button className="danger-link" onClick={() => onRemovePartner(promo, partner.partnerId, partner.partnerName)}>Видалити зв’язок</button>}</div></div>{partner.rawEmailSubject ? <div className="subject"><span>Вхідний текст</span><code>{partner.rawEmailSubject}</code></div> : <div className="manual-relation">Додано вручну</div>}</article>)}</section>
    {superuser && <section className="danger-zone"><h3>Адміністрування</h3><button className="danger-button" onClick={() => onDeletePromo(promo)}>Видалити промо</button></section>}
  </aside>{canExpand && expanding && <PartnerExpansionDialog options={options} selected={selectedPartnerIds} loading={loadingOptions} submitting={submitting} onToggle={(id) => setSelectedPartnerIds((current) => togglePartnerSelection(current, id))} onSelectAll={() => setSelectedPartnerIds(selectAllAvailablePartners(options))} onCancel={() => { setExpanding(false); setSelectedPartnerIds([]); }} onAdd={() => void addPartners()} />}</>;
}
