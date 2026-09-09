import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { formatCompactPeriod } from "./date.js";
import { escapeHtml } from "./html.js";

type PendingReport = PromoPartner & { promo: Promo; partner: Partner };

export function formatPendingReport(report: PendingReport): string {
  return [
    `🟡 <b>${escapeHtml(report.promo.lob)}</b>`,
    formatCompactPeriod(report.promo.startDate, report.promo.endDate),
    escapeHtml(report.promo.name), `⚠️ ${escapeHtml(report.partner.name)}`,
  ].join("\n");
}
