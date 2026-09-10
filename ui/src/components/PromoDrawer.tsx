import { useEffect } from "react";
import type { CurrentUser, PromoDto, PromoStatus } from "../types";
import { canManagePromos } from "../shared/lib/admin";
const labels: Record<PromoStatus, string> = { active: "Активне", planned: "Заплановане", finished: "Завершене" };
const formatDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
type Props = { promo: PromoDto; user: CurrentUser; busyId: string | null; onClose: () => void; onToggle: (id: string, received: boolean) => void; onDeletePromo: (promo: PromoDto) => void; onRemovePartner: (promo: PromoDto, partnerId: string, partnerName: string) => void };
export function PromoDrawer({ promo, user, busyId, onClose, onToggle, onDeletePromo, onRemovePartner }: Props) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  const superuser = canManagePromos(user);
  return <><button className="drawer-backdrop" aria-label="Закрити деталі" onClick={onClose} /><aside className="drawer" aria-label="Деталі промо"><header><div><span className="eyebrow">{promo.lob}</span><h2>{promo.name}</h2></div><button className="close" onClick={onClose} aria-label="Закрити">×</button></header>
    <dl className="details"><div><dt>Період</dt><dd>{formatDate(promo.startDate)} — {formatDate(promo.endDate)}</dd></div><div><dt>Статус</dt><dd><span className={`badge ${promo.status}`}>{labels[promo.status]}</span></dd></div></dl>
    <section><h3>Партнери</h3>{promo.partners.map((partner) => <article className="partner-detail" key={partner.promoPartnerId}><div className="partner-row"><div><strong>{partner.partnerName}</strong><span>{partner.reportReceived ? "Звіт отримано" : promo.status === "finished" ? "Очікується звіт" : "Звіт ще не очікується"}</span></div><div className="partner-actions"><button disabled={busyId === partner.promoPartnerId} className={partner.reportReceived ? "report received" : "report"} onClick={() => onToggle(partner.promoPartnerId, !partner.reportReceived)}>{partner.reportReceived ? "✓ Отримано" : "Позначити отриманим"}</button>{superuser && <button className="danger-link" onClick={() => onRemovePartner(promo, partner.partnerId, partner.partnerName)}>Видалити зв’язок</button>}</div></div><div className="subject"><span>Тема листа</span><code>{partner.rawEmailSubject}</code></div></article>)}</section>
    {superuser && <section className="danger-zone"><h3>Адміністрування</h3><button className="danger-button" onClick={() => onDeletePromo(promo)}>Видалити промо</button></section>}
  </aside></>;
}
