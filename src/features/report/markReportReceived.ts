import { prisma } from "../../shared/db/prisma.js";

export function markReportReceived(promoPartnerId: string, receivedAt: Date = new Date()) {
  return prisma.promoPartner.update({
    where: { id: promoPartnerId },
    data: { reportReceived: true, reportReceivedAt: receivedAt },
  });
}
