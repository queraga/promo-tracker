import type { Partner, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { CANONICAL_PARTNERS } from "../parsePromoSubject/parsePromoSubject.config.js";
import { orderPartnerNames } from "../partnerQueries/getPartnerNames.js";

export type AssignedPartner = Pick<Partner, "id" | "name">;
export type AdminPartnerCatalogItem = { key: string; id: string | null; name: string };

const canonicalNames = new Set<string>(CANONICAL_PARTNERS);
const canonicalKey = (name: string) => `canonical:${name}`;
const persistedKey = (id: string) => `partner:${id}`;

export class InvalidPartnerAssignmentError extends Error {
  constructor() { super("Invalid partner assignment"); }
}

export class SuperuserAssignmentsError extends Error {
  constructor() { super("Only KAM users use partner assignments"); }
}

export async function listAdminPartnerCatalog(): Promise<AdminPartnerCatalogItem[]> {
  const stored = await prisma.partner.findMany({
    where: { OR: [{ name: { in: [...CANONICAL_PARTNERS] } }, { promos: { some: {} } }, { users: { some: {} } }] },
    select: { id: true, name: true },
  });
  const byName = new Map(stored.map((partner) => [partner.name, partner]));
  const canonical = CANONICAL_PARTNERS.map((name) => ({ key: canonicalKey(name), id: byName.get(name)?.id ?? null, name }));
  const legacyNames = orderPartnerNames(stored.map(({ name }) => name)).filter((name) => !canonicalNames.has(name));
  const legacy = legacyNames.map((name) => {
    const partner = byName.get(name)!;
    return { key: persistedKey(partner.id), id: partner.id, name };
  });
  return [...canonical, ...legacy];
}

export async function resolvePartnerAssignmentKeys(
  tx: Prisma.TransactionClient,
  keys: string[],
): Promise<AssignedPartner[]> {
  const uniqueKeys = [...new Set(keys)];
  const partners: AssignedPartner[] = [];
  for (const key of uniqueKeys) {
    if (key.startsWith("canonical:")) {
      const name = key.slice("canonical:".length);
      if (!canonicalNames.has(name)) throw new InvalidPartnerAssignmentError();
      partners.push(await tx.partner.upsert({ where: { name }, update: {}, create: { name }, select: { id: true, name: true } }));
      continue;
    }
    if (key.startsWith("partner:")) {
      const id = key.slice("partner:".length);
      const partner = await tx.partner.findFirst({
        where: { id, OR: [{ name: { in: [...CANONICAL_PARTNERS] } }, { promos: { some: {} } }, { users: { some: {} } }] },
        select: { id: true, name: true },
      });
      if (!partner) throw new InvalidPartnerAssignmentError();
      partners.push(partner);
      continue;
    }
    throw new InvalidPartnerAssignmentError();
  }
  return partners;
}

export function orderAssignedPartners(partners: AssignedPartner[]): AssignedPartner[] {
  const byName = new Map(partners.map((partner) => [partner.name, partner]));
  return orderPartnerNames(partners.map(({ name }) => name)).map((name) => byName.get(name)!);
}

export async function replaceUserPartnerAssignments(userId: number, partnerKeys: string[]) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) return null;
    if (user.role !== "KAM") throw new SuperuserAssignmentsError();
    const partners = await resolvePartnerAssignmentKeys(tx, partnerKeys);
    await tx.userPartner.deleteMany({ where: { userId } });
    if (partners.length) await tx.userPartner.createMany({ data: partners.map(({ id: partnerId }) => ({ userId, partnerId })) });
    return orderAssignedPartners(partners);
  });
}
