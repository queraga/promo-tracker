import { prisma } from "../../shared/db/prisma.js";

export function markReportPending(promoPartnerId: string) {
  return prisma.promoPartner.update({
    where: { id: promoPartnerId },
    data: { reportReceived: false, reportReceivedAt: null },
  });
}
