import { prisma } from "../../shared/db/prisma.js";
import { toUtcCalendarDate } from "../../shared/date/toUtcCalendarDate.js";

export function getPendingReports(asOfDate: Date = new Date()) {
  const asOfCalendarDate = toUtcCalendarDate(asOfDate);

  return prisma.promoPartner.findMany({
    where: {
      reportReceived: false,
      promo: { endDate: { lt: asOfCalendarDate } },
    },
    include: { promo: true, partner: true },
  });
}
