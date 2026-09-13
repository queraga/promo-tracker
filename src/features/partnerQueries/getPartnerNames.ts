import { prisma } from "../../shared/db/prisma.js";
import { CANONICAL_PARTNERS } from "../parsePromoSubject/parsePromoSubject.config.js";

export async function getPartnerNames(): Promise<string[]> {
  const stored = await prisma.partner.findMany({
    where: { promos: { some: {} } },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const storedNames = new Set(stored.map(({ name }) => name));
  const canonical = new Set<string>(CANONICAL_PARTNERS);
  const legacy = stored.map(({ name }) => name).filter((name) => !canonical.has(name));
  return [...CANONICAL_PARTNERS.filter((name) => storedNames.has(name)), ...legacy];
}
