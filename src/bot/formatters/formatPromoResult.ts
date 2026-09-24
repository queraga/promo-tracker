import type { CreatePromoResult } from "../../features/createPromo/createPromo.types.js";
import { formatCompactPeriod } from "./date.js";
import { escapeHtml } from "./html.js";

export function formatPromoResult(result: CreatePromoResult): string {
  if (!result.createdPromo && result.createdPromoPartner) {
    return `✅ <b>Партнера додано до наявного промо</b>\n\nПромо: ${escapeHtml(result.promo.name)}\nPartner: ${escapeHtml(result.partner.name)}`;
  }
  if (!result.createdPromoPartner) {
    return "ℹ️ <b>Промо вже існує</b>\n\nВхідний текст оновлено.";
  }
  return [
    "✅ <b>Промо додано</b>", "", `LOB: ${escapeHtml(result.promo.lob)}`,
    `Partner: ${escapeHtml(result.partner.name)}`,
    `Period: ${formatCompactPeriod(result.promo.startDate, result.promo.endDate)}`,
  ].join("\n");
}
