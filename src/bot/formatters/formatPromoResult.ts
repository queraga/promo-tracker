import type { CreatePromoResult } from "../../features/createPromo/createPromo.types.js";
import { formatCompactPeriod } from "./date.js";
import { escapeHtml } from "./html.js";

export function formatPromoResult(result: CreatePromoResult): string {
  if (!result.createdPromo && result.createdPromoPartner) {
    return `✅ <b>Partner added to existing promo</b>\n\nPromo: ${escapeHtml(result.promo.name)}\nPartner: ${escapeHtml(result.partner.name)}`;
  }
  if (!result.createdPromoPartner) {
    return "ℹ️ <b>Promo already exists</b>\n\nLatest email subject was updated.";
  }
  return [
    "✅ <b>Promo added</b>", "", `LOB: ${escapeHtml(result.promo.lob)}`,
    `Partner: ${escapeHtml(result.partner.name)}`,
    `Period: ${formatCompactPeriod(result.promo.startDate, result.promo.endDate)}`,
  ].join("\n");
}
