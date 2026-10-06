import { quarterForEndDate, quarterKeyForEndDate, type CalendarQuarter } from "../../../../src/shared/date/quarter.js";
import type { Filters, PartnerOption, PromoDto, PromoPartnerDto, PromoStatus, QuarterSelection } from "../../types";
const statusOrder: Record<PromoStatus, number> = { active: 0, planned: 1, finished: 2 };
export function getPartnerColumns(promos: PromoDto[]): string[] { return [...new Set(promos.flatMap((promo) => promo.partners.map((partner) => partner.partnerName)))].sort((a, b) => a.localeCompare(b)); }
export function getVisiblePartnerColumns(available: string[], selected: string[] | null): string[] { return selected === null ? available : available.filter((partner) => selected.includes(partner)); }
export function getWorkspacePartnerOptions(promos: PromoDto[], availableNames: string[]): PartnerOption[] {
  const idsByName = new Map<string, string>();
  for (const promo of promos) for (const relation of promo.partners) if (!idsByName.has(relation.partnerName)) idsByName.set(relation.partnerName, relation.partnerId);
  return availableNames.map((name) => ({ id: idsByName.get(name) ?? `unassociated:${name}`, name }));
}
export function getVisiblePartnerOptions(available: PartnerOption[], selected: string[] | null): PartnerOption[] {
  return selected === null ? available : available.filter((partner) => selected.includes(partner.id));
}
export function getCurrentQuarter(now: Date = new Date()): CalendarQuarter { return quarterForEndDate(now); }
export function getWorkspaceQuarterOptions(promos: PromoDto[], currentQuarter: QuarterSelection): QuarterSelection[] {
  const quarters = new Map<string, QuarterSelection>([[`${currentQuarter.year}-Q${currentQuarter.quarter}`, currentQuarter]]);
  for (const promo of promos) {
    const quarter = quarterForEndDate(promo.endDate);
    quarters.set(`${quarter.year}-Q${quarter.quarter}`, quarter);
  }
  return [...quarters.values()].sort((left, right) => right.year - left.year || right.quarter - left.quarter);
}
export function reconcileQuarterSelection(selected: QuarterSelection | null, available: QuarterSelection[], currentQuarter: QuarterSelection): QuarterSelection | null {
  if (!selected) return null;
  if (available.some((quarter) => quarter.year === selected.year && quarter.quarter === selected.quarter)) return selected;
  return currentQuarter;
}
export function createDefaultFilters(now: Date = new Date()): Filters {
  return { search: "", lob: "", status: "", quarter: getCurrentQuarter(now), partners: null };
}
export function filterPromos(promos: PromoDto[], filters: Filters): PromoDto[] {
  const query = filters.search.trim().toLocaleLowerCase();
  const quarterKey = filters.quarter ? `${filters.quarter.year}-Q${filters.quarter.quarter}` : null;
  const selectedPartners = filters.partners;
  return promos.filter((promo) => {
    const search = !query || [promo.name, promo.lob, ...promo.partners.map((partner) => partner.partnerName)].some((value) => value.toLocaleLowerCase().includes(query));
    const quarterMatches = !quarterKey || quarterKeyForEndDate(promo.endDate) === quarterKey;
    const partnerMatches = selectedPartners === null || promo.partners.some((partner) => selectedPartners.includes(partner.partnerId));
    return search && quarterMatches && partnerMatches && (!filters.lob || promo.lob === filters.lob) && (!filters.status || promo.status === filters.status);
  });
}
export function hasPendingReport(promo: PromoDto, selectedPartnerIds: string[] | null = null): boolean {
  return promo.status === "finished" && promo.partners.some((partner) => !partner.reportReceived && (selectedPartnerIds === null || selectedPartnerIds.includes(partner.partnerId)));
}
export function getWorkspaceEmptyMessage(promos: PromoDto[], filters: Filters, pendingOnly: boolean): string {
  if (!promos.length) return "Промо ще не додані.";
  if (filters.partners?.length === 0) return "Партнерів не обрано. Натисніть «Обрати всіх» або виберіть партнерів у фільтрі.";
  if (filters.quarter && !promos.some((promo) => quarterKeyForEndDate(promo.endDate) === `${filters.quarter!.year}-Q${filters.quarter!.quarter}`)) {
    return `У Q${filters.quarter.quarter} ${filters.quarter.year} немає відкритих промо. Оберіть інший квартал або «Усі».`;
  }
  if (pendingOnly) return "Для цього набору фільтрів немає звітів, що очікуються.";
  return "Нічого не знайдено.";
}
export function countPendingReports(promos: PromoDto[], selectedPartnerIds: string[] | null = null): number {
  return promos.reduce((count, promo) => count + (promo.status === "finished" ? promo.partners.filter((partner) => !partner.reportReceived && (selectedPartnerIds === null || selectedPartnerIds.includes(partner.partnerId))).length : 0), 0);
}
export function sortPromos(promos: PromoDto[]): PromoDto[] { return [...promos].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || Date.parse(b.startDate) - Date.parse(a.startDate)); }
export type PartnerCellState = "none" | "participating" | "pending" | "received";
export function getPartnerCellState(status: PromoStatus, partner?: PromoPartnerDto): PartnerCellState { if (!partner) return "none"; if (status !== "finished") return "participating"; return partner.reportReceived ? "received" : "pending"; }
