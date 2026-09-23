import { CANONICAL_PARTNERS } from "../parsePromoSubject/parsePromoSubject.config.js";
import { getAllPromos } from "../promoQueries/getAllPromos.js";

export function orderPartnerNames(names: string[]): string[] {
  const storedNames = new Set(names);
  const canonical = new Set<string>(CANONICAL_PARTNERS);
  const legacy = [...storedNames].filter((name) => !canonical.has(name)).sort((a, b) => a.localeCompare(b));
  return [...CANONICAL_PARTNERS.filter((name) => storedNames.has(name)), ...legacy];
}

export async function getPartnerNames(): Promise<string[]> {
  const promos = await getAllPromos();
  return orderPartnerNames([...new Set(promos.flatMap(({ partners }) => partners.map(({ partner }) => partner.name)))]);
}
