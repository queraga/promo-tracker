import { prisma } from "../../shared/db/prisma.js";
import { excludeClosedPeriodPromos, requireOpenPromoPartner } from "../quarterlyReporting/closedPeriods.js";

export async function getReportReminderCandidates() {
  const candidates = await prisma.promoPartner.findMany({
    where: { reportReceived: false },
    include: { promo: true, partner: true },
  });
  const openIds = new Set((await excludeClosedPeriodPromos(candidates.map(({ promo }) => promo))).map(({ id }) => id));
  return candidates.filter(({ promoId }) => openIds.has(promoId));
}

export async function markFirstReminderSent(id: string, sentAt: Date) {
  return prisma.$transaction(async (transaction) => { await requireOpenPromoPartner(id, transaction); return transaction.promoPartner.update({ where: { id }, data: { firstReminderSentAt: sentAt } }); });
}

export async function markSecondReminderSent(id: string, sentAt: Date) {
  return prisma.$transaction(async (transaction) => { await requireOpenPromoPartner(id, transaction); return transaction.promoPartner.update({ where: { id }, data: { secondReminderSentAt: sentAt } }); });
}
