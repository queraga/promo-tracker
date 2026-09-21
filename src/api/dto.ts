import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { getPromoStatus, type PromoStatus } from "../entities/promo/getPromoStatus.js";

export type PromoRecord = Promo & { partners: Array<PromoPartner & { partner: Partner }> };
export type PromoDto = { id: string; lob: string; name: string; startDate: string; endDate: string; status: PromoStatus; partners: Array<{ promoPartnerId: string; partnerId: string; partnerName: string; reportReceived: boolean; reportReceivedAt: string | null; rawEmailSubject: string | null }> };

export function toPromoDto(promo: PromoRecord, currentDate = new Date()): PromoDto {
  return { id: promo.id, lob: promo.lob, name: promo.name, startDate: promo.startDate.toISOString(), endDate: promo.endDate.toISOString(), status: getPromoStatus(promo.startDate, promo.endDate, currentDate), partners: promo.partners.map((relation) => ({ promoPartnerId: relation.id, partnerId: relation.partnerId, partnerName: relation.partner.name, reportReceived: relation.reportReceived, reportReceivedAt: relation.reportReceivedAt?.toISOString() ?? null, rawEmailSubject: relation.rawEmailSubject })) };
}

export type PendingReportRecord = PromoPartner & { promo: Promo; partner: Partner };
export function toPendingReportDto(record: PendingReportRecord) {
  return { promoPartnerId: record.id, promoId: record.promoId, promoName: record.promo.name, lob: record.promo.lob, endDate: record.promo.endDate.toISOString(), partnerId: record.partnerId, partnerName: record.partner.name, reportReceived: record.reportReceived, reportReceivedAt: record.reportReceivedAt?.toISOString() ?? null };
}
