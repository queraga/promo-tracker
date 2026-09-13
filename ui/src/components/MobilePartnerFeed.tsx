import type { PromoDto, PromoStatus } from "../types";
import { sortPromos } from "../shared/lib/tracker";

const labels: Record<PromoStatus, string> = { active: "Активне", planned: "Заплановане", finished: "Завершене" };
const formatDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(value));

type Props = { promos: PromoDto[]; partners: string[]; selectedPartner: string; pendingOnly: boolean; onPartnerChange: (partner: string) => void; onSelect: (id: string) => void };

export function getPartnerFeed(promos: PromoDto[], partnerName: string, pendingOnly: boolean): PromoDto[] {
  if (!partnerName) return [];
  return sortPromos(promos.filter((promo) => {
    const relation = promo.partners.find((partner) => partner.partnerName === partnerName);
    return relation && (!pendingOnly || (promo.status === "finished" && !relation.reportReceived));
  }));
}

export function MobilePartnerFeed({ promos, partners, selectedPartner, pendingOnly, onPartnerChange, onSelect }: Props) {
  const feed = getPartnerFeed(promos, selectedPartner, pendingOnly);
  return <section className="mobile-feed" aria-label="Промо вибраного партнера">
    <label className="mobile-partner-select"><span>Партнер</span><select value={selectedPartner} onChange={(event) => onPartnerChange(event.target.value)}><option value="">Оберіть партнера</option>{partners.map((partner) => <option key={partner}>{partner}</option>)}</select></label>
    {!selectedPartner ? <div className="mobile-empty"><strong>Оберіть партнера</strong><span>Після вибору тут з’являться його промоактивності.</span></div> : feed.length === 0 ? <div className="mobile-empty"><strong>Промо не знайдено</strong><span>{pendingOnly ? "Для цього партнера немає звітів, що очікуються." : "Для цього партнера ще немає промо."}</span></div> : <div className="promo-feed">{feed.map((promo) => {
      const relation = promo.partners.find((partner) => partner.partnerName === selectedPartner)!;
      const report = relation.reportReceived ? "✓ Звіт отримано" : promo.status === "finished" ? "⚠ Очікується звіт" : "Звіт ще не очікується";
      return <button type="button" className="promo-card" key={promo.id} onClick={() => onSelect(promo.id)}>
        <span className="promo-card-top"><strong>{promo.lob}</strong><span className={`badge ${promo.status}`}>{labels[promo.status]}</span></span>
        <span className="promo-card-name">{promo.name}</span>
        <span className="promo-card-period">{formatDate(promo.startDate)}–{formatDate(promo.endDate)}</span>
        <span className={`promo-card-report${relation.reportReceived ? " received" : promo.status === "finished" ? " pending" : ""}`}>{report}</span>
      </button>;
    })}</div>}
  </section>;
}
