import type { PromoPartner } from "@prisma/client";
import { getPromoPartnerById } from "../promoQueries/getPromoPartnerById.js";
import { markReportPending } from "../report/markReportPending.js";
import { markReportReceived } from "../report/markReportReceived.js";
import type { PartnerAccessScope } from "./partnerAccess.types.js";
import { requireOpenPromoPartner } from "../quarterlyReporting/closedPeriods.js";

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

  const relation = await requireOpenPromoPartner(id);
  if (!relation || !scope.partnerIds.includes(relation.partnerId)) return null;
  return received ? markReportReceived(id, receivedAt) : markReportPending(id);
}
