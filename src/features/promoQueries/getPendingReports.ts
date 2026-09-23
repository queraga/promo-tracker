import { prisma } from "../../shared/db/prisma.js";
import { toUtcCalendarDate } from "../../shared/date/toUtcCalendarDate.js";
import { excludeClosedPeriodPromos } from "../quarterlyReporting/closedPeriods.js";

export async function getPendingReports(asOfDate: Date = new Date()) {
  const asOfCalendarDate = toUtcCalendarDate(asOfDate);

  const reports = await prisma.promoPartner.findMany({
    where: {
      reportReceived: false,
      promo: { endDate: { lt: asOfCalendarDate } },
    },
    include: { promo: true, partner: true },
  });
  const openPromos = new Set((await excludeClosedPeriodPromos(reports.map(({ promo }) => promo))).map(({ id }) => id));
  return reports.filter(({ promoId }) => openPromos.has(promoId));
}
