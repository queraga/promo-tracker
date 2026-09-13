import type { PromoDto, PromoStatus } from "../types";
import { getPartnerCellState } from "../shared/lib/tracker";
const labels: Record<PromoStatus, string> = { active: "Активне", planned: "Заплановане", finished: "Завершене" };
const formatDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(value));
export function TrackerTable({ promos, partners, onSelect }: { promos: PromoDto[]; partners: string[]; onSelect: (id: string) => void }) {
  if (!promos.length) return <div className="empty">Нічого не знайдено.</div>;
  return <div className="table-wrap"><table><thead><tr><th className="sticky lob">LOB</th><th className="sticky promo">Промо</th><th className="sticky period">Період</th><th className="sticky status-column">Статус</th>{partners.map((partner) => <th className="partner-heading" key={partner}>{partner}</th>)}</tr></thead>
    <tbody>{promos.map((promo) => <tr key={promo.id} tabIndex={0} onClick={() => onSelect(promo.id)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(promo.id); }}><td className="sticky lob"><strong>{promo.lob}</strong></td><td className="sticky promo">{promo.name}</td><td className="sticky period">{formatDate(promo.startDate)}–{formatDate(promo.endDate)}</td><td className="sticky status-column"><span className={`badge ${promo.status}`}>{labels[promo.status]}</span></td>
      {partners.map((name) => { const relation = promo.partners.find((item) => item.partnerName === name); const state = getPartnerCellState(promo.status, relation); return <td key={name} className={`partner-cell ${state}`} title={state === "pending" ? "Очікується звіт" : state === "received" ? "Звіт отримано" : undefined}>{state === "none" ? "–" : state === "pending" ? "!" : state === "received" ? "✓" : "•"}</td>; })}</tr>)}</tbody></table></div>;
}
