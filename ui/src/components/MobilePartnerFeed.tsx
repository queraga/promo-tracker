import type { PartnerOption, PromoDto, PromoStatus } from "../types";
import { sortPromos } from "../shared/lib/tracker";
import { ProlongedBadge, SpecialPromoBadge } from "./PromoProlongation";

const labels: Record<PromoStatus, string> = { active: "Активне", planned: "Заплановане", finished: "Завершене" };
const formatDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(value));

type Props = { promos: PromoDto[]; partners: PartnerOption[]; selectedPartners: string[] | null; pendingOnly: boolean; onSelect: (id: string) => void };

export function getPartnerFeed(promos: PromoDto[], selectedPartnerIds: string[] | null, pendingOnly: boolean): PromoDto[] {
  return sortPromos(promos.filter((promo) => {
    const relations = selectedPartnerIds === null ? promo.partners : promo.partners.filter((partner) => selectedPartnerIds.includes(partner.partnerId));
    return (selectedPartnerIds === null || relations.length > 0) && (!pendingOnly || (promo.status === "finished" && relations.some((relation) => !relation.reportReceived)));
  }));
}

export function MobilePartnerFeed({ promos, partners, selectedPartners, pendingOnly, onSelect }: Props) {
  const allowedIds = new Set(partners.map(({ id }) => id));
  const selection = selectedPartners === null ? null : selectedPartners.filter((id) => allowedIds.has(id));
  const feed = getPartnerFeed(promos, selection, pendingOnly);
  return <section className="mobile-feed" aria-label="Промо вибраних партнерів">
    {selection?.length === 0 ? <div className="mobile-empty"><strong>Партнерів не обрано</strong><span>Натисніть «Обрати всіх» або виберіть потрібних партнерів у фільтрах.</span></div> : feed.length === 0 ? <div className="mobile-empty"><strong>Промо не знайдено</strong><span>{pendingOnly ? "Для цього набору фільтрів немає звітів, що очікуються." : "Для цього набору фільтрів промо немає."}</span></div> : <div className="promo-feed">{feed.map((promo) => {
      const relations = selection === null ? promo.partners : promo.partners.filter((partner) => selection.includes(partner.partnerId));
      return <button type="button" className="promo-card" key={promo.id} onClick={() => onSelect(promo.id)}>
        <span className="promo-card-top"><strong>{promo.lob}</strong><span className={`badge ${promo.status}`}>{labels[promo.status]}</span></span>
        <span className="promo-card-name promo-name-with-metadata">{promo.name}<SpecialPromoBadge specialPromo={promo.specialPromo} /><ProlongedBadge prolongedAt={promo.prolongedAt} /></span>
        <span className="promo-card-period">{formatDate(promo.startDate)}–{formatDate(promo.endDate)}</span>
        {relations.length ? relations.map((relation) => {
          const report = relation.reportReceived ? "✓ Звіт отримано" : promo.status === "finished" ? "⚠ Очікується звіт" : "Звіт ще не очікується";
          return <span className={`promo-card-report${relation.reportReceived ? " received" : promo.status === "finished" ? " pending" : ""}`} key={relation.partnerId}><strong>{relation.partnerName}: </strong>{report}</span>;
        }) : <span className="promo-card-report">Немає партнерських зв’язків</span>}
      </button>;
    })}</div>}
  </section>;
}
