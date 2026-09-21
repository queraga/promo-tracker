import { Prisma } from "@prisma/client";
import type { PromoRecord } from "../../api/dto.js";
import { prisma } from "../../shared/db/prisma.js";
import { orderPartnerNames } from "../partnerQueries/getPartnerNames.js";
import type { PartnerAccessScope } from "./partnerAccess.types.js";

export type PromoPartnerOption = { id: string; name: string; alreadyAssociated: boolean };

export class PartnerExpansionTargetError extends Error {
  constructor() { super("One or more partners are unavailable"); }
}

const visiblePromoWhere = (promoId: string, scope: PartnerAccessScope): Prisma.PromoWhereInput => scope.kind === "global"
  ? { id: promoId }
  : { id: promoId, partners: { some: { partnerId: { in: scope.partnerIds } } } };

export async function getPromoPartnerOptions(promoId: string, scope: PartnerAccessScope): Promise<PromoPartnerOption[] | null> {
  const promo = await prisma.promo.findFirst({ where: visiblePromoWhere(promoId, scope), select: { partners: { select: { partnerId: true } } } });
  if (!promo) return null;
  const partners = await prisma.partner.findMany({
    where: scope.kind === "global" ? {} : { id: { in: scope.partnerIds } },
    select: { id: true, name: true },
  });
  const associated = new Set(promo.partners.map(({ partnerId }) => partnerId));
  const byName = new Map(partners.map((partner) => [partner.name, partner]));
  return orderPartnerNames(partners.map(({ name }) => name)).map((name) => {
    const partner = byName.get(name)!;
    return { ...partner, alreadyAssociated: associated.has(partner.id) };
  });
}

export async function expandPromoPartners(promoId: string, partnerIds: string[], scope: PartnerAccessScope): Promise<PromoRecord | null> {
  const requestedIds = [...new Set(partnerIds)];
  return prisma.$transaction(async (tx) => {
    const promo = await tx.promo.findFirst({ where: visiblePromoWhere(promoId, scope), select: { id: true } });
    if (!promo) return null;

    const allowedTargetIds = scope.kind === "global" ? requestedIds : requestedIds.filter((id) => scope.partnerIds.includes(id));
    const targets = await tx.partner.findMany({
      where: { id: { in: allowedTargetIds } },
      select: { id: true },
    });
    if (targets.length !== requestedIds.length) throw new PartnerExpansionTargetError();

    for (const { id: partnerId } of targets) {
      await tx.promoPartner.upsert({
        where: { promoId_partnerId: { promoId, partnerId } },
        create: { promoId, partnerId, rawEmailSubject: null },
        update: {},
      });
    }

    return tx.promo.findUniqueOrThrow({
      where: { id: promoId },
      include: { partners: { where: scope.kind === "global" ? {} : { partnerId: { in: scope.partnerIds } }, include: { partner: true } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
