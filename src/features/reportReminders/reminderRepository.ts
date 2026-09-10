import { prisma } from "../../shared/db/prisma.js";

export function getReportReminderCandidates() {
  return prisma.promoPartner.findMany({
    where: { reportReceived: false },
    include: { promo: true, partner: true },
  });
}

export function markFirstReminderSent(id: string, sentAt: Date) {
  return prisma.promoPartner.update({ where: { id }, data: { firstReminderSentAt: sentAt } });
}

export function markSecondReminderSent(id: string, sentAt: Date) {
  return prisma.promoPartner.update({ where: { id }, data: { secondReminderSentAt: sentAt } });
}
