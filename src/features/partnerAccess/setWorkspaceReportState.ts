import type { PromoPartner } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { getPromoPartnerById } from "../promoQueries/getPromoPartnerById.js";
import { markReportPending } from "../report/markReportPending.js";
import { markReportReceived } from "../report/markReportReceived.js";
import type { PartnerAccessScope } from "./partnerAccess.types.js";

export async function setWorkspaceReportState(
  id: string,
  received: boolean,
  scope: PartnerAccessScope,
  receivedAt: Date = new Date(),
): Promise<PromoPartner | null> {
  if (scope.kind === "global") {
    if (!await getPromoPartnerById(id)) return null;
    return received ? markReportReceived(id, receivedAt) : markReportPending(id);
  }

  const result = await prisma.promoPartner.updateMany({
    where: { id, partnerId: { in: scope.partnerIds } },
    data: received
      ? { reportReceived: true, reportReceivedAt: receivedAt }
      : { reportReceived: false, reportReceivedAt: null },
  });
  if (result.count !== 1) return null;
  return getPromoPartnerById(id);
}
