import { useEffect } from "react";
import type { PromoDto, PromoStatus } from "../types";
const labels: Record<PromoStatus, string> = { active: "Активне", planned: "Заплановане", finished: "Завершене" };
const formatDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
export function PromoDrawer({ promo, busyId, onClose, onToggle }: { promo: PromoDto; busyId: string | null; onClose: () => void; onToggle: (id: string, received: boolean) => void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  return <><button className="drawer-backdrop" aria-label="Закрити деталі" onClick={onClose} /><aside className="drawer" aria-label="Деталі промо"><header><div><span className="eyebrow">{promo.lob}</span><h2>{promo.name}</h2></div><button className="close" onClick={onClose} aria-label="Закрити">×</button></header>
    <dl className="details"><div><dt>Період</dt><dd>{formatDate(promo.startDate)} — {formatDate(promo.endDate)}</dd></div><div><dt>Статус</dt><dd><span className={`badge ${promo.status}`}>{labels[promo.status]}</span></dd></div></dl>
    <section><h3>Партнери</h3>{promo.partners.map((partner) => <article className="partner-detail" key={partner.promoPartnerId}><div className="partner-row"><div><strong>{partner.partnerName}</strong><span>{partner.reportReceived ? "Звіт отримано" : promo.status === "finished" ? "Очікується звіт" : "Звіт ще не очікується"}</span></div><button disabled={busyId === partner.promoPartnerId} className={partner.reportReceived ? "report received" : "report"} onClick={() => onToggle(partner.promoPartnerId, !partner.reportReceived)}>{partner.reportReceived ? "✓ Отримано" : "Позначити отриманим"}</button></div><div className="subject"><span>Тема листа</span><code>{partner.rawEmailSubject}</code></div></article>)}</section>
  </aside></>;
}
