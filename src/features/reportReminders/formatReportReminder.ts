import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { formatCompactPeriod } from "../../bot/formatters/date.js";
import { escapeHtml } from "../../bot/formatters/html.js";

export type ReminderRecord = PromoPartner & { promo: Promo; partner: Partner };
export type ReminderType = "first" | "second";

export function formatReportReminder(record: ReminderRecord, type: ReminderType): string {
  return [
    type === "first" ? "🔔 <b>Promo finished</b>" : "⚠️ <b>Promo report reminder</b>",
    "",
    `LOB: <b>${escapeHtml(record.promo.lob)}</b>`,
    `Promo: ${escapeHtml(record.promo.name)}`,
    `Period: ${formatCompactPeriod(record.promo.startDate, record.promo.endDate)}`,
    `Partner: ${escapeHtml(record.partner.name)}`,
    "",
    type === "first" ? "Promo report is pending." : "The report is still pending.",
  ].join("\n");
}
