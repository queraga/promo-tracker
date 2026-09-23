import { prisma } from "../../shared/db/prisma.js";
import { requireOpenPromoPartner } from "../quarterlyReporting/closedPeriods.js";

export async function markReportReceived(promoPartnerId: string, receivedAt: Date = new Date()) {
  return prisma.$transaction(async (transaction) => {
    await requireOpenPromoPartner(promoPartnerId, transaction);
    return transaction.promoPartner.update({
      where: { id: promoPartnerId },
      data: { reportReceived: true, reportReceivedAt: receivedAt },
    });
  });
}
