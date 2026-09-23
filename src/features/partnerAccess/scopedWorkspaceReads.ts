import { prisma } from "../../shared/db/prisma.js";
import { getPartnerNames, orderPartnerNames } from "../partnerQueries/getPartnerNames.js";
import { getAllPromos } from "../promoQueries/getAllPromos.js";
import { getPendingReports } from "../promoQueries/getPendingReports.js";
import { getPromoById } from "../promoQueries/getPromoById.js";
import { toUtcCalendarDate } from "../../shared/date/toUtcCalendarDate.js";
import type { PartnerAccessScope } from "./partnerAccess.types.js";
import { excludeClosedPeriodPromos } from "../quarterlyReporting/closedPeriods.js";

export async function getWorkspacePromos(scope: PartnerAccessScope) {
  if (scope.kind === "global") return getAllPromos();
  const partnerFilter = { partnerId: { in: scope.partnerIds } };
  return excludeClosedPeriodPromos(await prisma.promo.findMany({
    where: { partners: { some: partnerFilter } },
    include: { partners: { where: partnerFilter, include: { partner: true } } },
  }));
}

export async function getWorkspacePromoById(id: string, scope: PartnerAccessScope) {
  if (scope.kind === "global") {
    const promo = await getPromoById(id);
    return promo && (await excludeClosedPeriodPromos([promo])).length ? promo : null;
  }
  const partnerFilter = { partnerId: { in: scope.partnerIds } };
  const promo = await prisma.promo.findFirst({
    where: { id, partners: { some: partnerFilter } },
    include: { partners: { where: partnerFilter, include: { partner: true } } },
  });
  return promo && (await excludeClosedPeriodPromos([promo])).length ? promo : null;
}

export async function getWorkspacePendingReports(scope: PartnerAccessScope, asOfDate: Date = new Date()) {
  if (scope.kind === "global") return getPendingReports(asOfDate);
  const reports = await prisma.promoPartner.findMany({
    where: {
      partnerId: { in: scope.partnerIds },
      reportReceived: false,
      promo: { endDate: { lt: toUtcCalendarDate(asOfDate) } },
    },
    include: { promo: true, partner: true },
  });
  const openIds = new Set((await excludeClosedPeriodPromos(reports.map(({ promo }) => promo))).map(({ id }) => id));
  return reports.filter(({ promoId }) => openIds.has(promoId));
}

export async function getWorkspacePartnerNames(scope: PartnerAccessScope): Promise<string[]> {
  if (scope.kind === "global") return getPartnerNames();
  const partners = await prisma.partner.findMany({
    where: { id: { in: scope.partnerIds } },
    select: { name: true },
  });
  return orderPartnerNames(partners.map(({ name }) => name));
}
