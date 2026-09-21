import { prisma } from "../../shared/db/prisma.js";
import { CANONICAL_PARTNERS } from "../parsePromoSubject/parsePromoSubject.config.js";

export function orderPartnerNames(names: string[]): string[] {
  const storedNames = new Set(names);
  const canonical = new Set<string>(CANONICAL_PARTNERS);
  const legacy = [...storedNames].filter((name) => !canonical.has(name)).sort((a, b) => a.localeCompare(b));
  return [...CANONICAL_PARTNERS.filter((name) => storedNames.has(name)), ...legacy];
}

export async function getPartnerNames(): Promise<string[]> {
  const stored = await prisma.partner.findMany({
    where: { promos: { some: {} } },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return orderPartnerNames(stored.map(({ name }) => name));
}
