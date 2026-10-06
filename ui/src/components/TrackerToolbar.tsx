import type { Filters, PartnerOption, QuarterSelection } from "../types";
import { PartnerColumnSelector } from "./PartnerColumnSelector";
type Props = { filters: Filters; setFilters: (filters: Filters) => void; lobs: string[]; quarters: QuarterSelection[]; partners: PartnerOption[]; onPartnersChange: (partners: string[] | null) => void; onReset: () => void };
export function TrackerToolbar({ filters, setFilters, lobs, quarters, partners, onPartnersChange, onReset }: Props) {
  const update = (field: "search" | "lob" | "status", value: string) => setFilters({ ...filters, [field]: value });
  const quarterValue = filters.quarter ? `${filters.quarter.year}-Q${filters.quarter.quarter}` : "";
  return <section className="toolbar" aria-label="Фільтри промо">
    <label className="search"><span>Пошук</span><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Промо, LOB або партнер" /></label>
    <label><span>Квартал</span><select aria-label="Квартал" value={quarterValue} onChange={(event) => { const value = event.target.value; const selected = quarters.find((quarter) => `${quarter.year}-Q${quarter.quarter}` === value); setFilters({ ...filters, quarter: selected ?? null }); }}><option value="">Усі</option>{quarters.map((quarter) => <option key={`${quarter.year}-Q${quarter.quarter}`} value={`${quarter.year}-Q${quarter.quarter}`}>Q{quarter.quarter} {quarter.year}</option>)}</select></label>
    <label><span>LOB</span><select value={filters.lob} onChange={(event) => update("lob", event.target.value)}><option value="">Усі</option>{lobs.map((lob) => <option key={lob}>{lob}</option>)}</select></label>
    <label><span>Статус</span><select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="">Усі</option><option value="active">Активні</option><option value="planned">Заплановані</option><option value="finished">Завершені</option></select></label>
    <PartnerColumnSelector partners={partners} selected={filters.partners} onChange={onPartnersChange} />
    <button type="button" className="reset" onClick={onReset}>Скинути фільтри</button>
  </section>;
}
