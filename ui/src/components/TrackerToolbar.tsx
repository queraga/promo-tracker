import type { Filters } from "../types";
import { PartnerColumnSelector } from "./PartnerColumnSelector";
type Props = { filters: Filters; setFilters: (filters: Filters) => void; lobs: string[]; partners: string[]; selectedPartners: string[] | null; setSelectedPartners: (partners: string[] | null) => void };
export function TrackerToolbar({ filters, setFilters, lobs, partners, selectedPartners, setSelectedPartners }: Props) {
  const update = (field: keyof Filters, value: string) => setFilters({ ...filters, [field]: value });
  return <section className="toolbar" aria-label="Фільтри промо">
    <label className="search"><span>Пошук</span><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Промо, LOB або партнер" /></label>
    <label><span>LOB</span><select value={filters.lob} onChange={(event) => update("lob", event.target.value)}><option value="">Усі</option>{lobs.map((lob) => <option key={lob}>{lob}</option>)}</select></label>
    <label><span>Статус</span><select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="">Усі</option><option value="active">Активні</option><option value="planned">Заплановані</option><option value="finished">Завершені</option></select></label>
    <label><span>Партнер</span><select value={filters.partner} onChange={(event) => update("partner", event.target.value)}><option value="">Усі</option>{partners.map((partner) => <option key={partner}>{partner}</option>)}</select></label>
    <PartnerColumnSelector partners={partners} selected={selectedPartners} onChange={setSelectedPartners} />
    <button className="reset" onClick={() => setFilters({ search: "", lob: "", status: "", partner: "" })}>Скинути фільтри</button>
  </section>;
}
