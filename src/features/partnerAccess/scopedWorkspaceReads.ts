import { prisma } from "../../shared/db/prisma.js";
import { getPartnerNames, orderPartnerNames } from "../partnerQueries/getPartnerNames.js";
import { getAllPromos } from "../promoQueries/getAllPromos.js";
import { getPendingReports } from "../promoQueries/getPendingReports.js";
import { getPromoById } from "../promoQueries/getPromoById.js";
import { toUtcCalendarDate } from "../../shared/date/toUtcCalendarDate.js";
import type { PartnerAccessScope } from "./partnerAccess.types.js";

export function getWorkspacePromos(scope: PartnerAccessScope) {
  if (scope.kind === "global") return getAllPromos();
  const partnerFilter = { partnerId: { in: scope.partnerIds } };
  return prisma.promo.findMany({
    where: { partners: { some: partnerFilter } },
    include: { partners: { where: partnerFilter, include: { partner: true } } },
  });
}

export function getWorkspacePromoById(id: string, scope: PartnerAccessScope) {
  if (scope.kind === "global") return getPromoById(id);
  const partnerFilter = { partnerId: { in: scope.partnerIds } };
  return prisma.promo.findFirst({
    where: { id, partners: { some: partnerFilter } },
    include: { partners: { where: partnerFilter, include: { partner: true } } },
  });
}

export function getWorkspacePendingReports(scope: PartnerAccessScope, asOfDate: Date = new Date()) {
  if (scope.kind === "global") return getPendingReports(asOfDate);
  return prisma.promoPartner.findMany({
    where: {
      partnerId: { in: scope.partnerIds },
      reportReceived: false,
      promo: { endDate: { lt: toUtcCalendarDate(asOfDate) } },
    },
    include: { promo: true, partner: true },
  });
}

export async function getWorkspacePartnerNames(scope: PartnerAccessScope): Promise<string[]> {
  if (scope.kind === "global") return getPartnerNames();
  const partners = await prisma.partner.findMany({
    where: { id: { in: scope.partnerIds } },
    select: { name: true },
  });
  return orderPartnerNames(partners.map(({ name }) => name));
}
