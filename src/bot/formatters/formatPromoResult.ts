import type { CreatePromoResult } from "../../features/createPromo/createPromo.types.js";
import { formatCompactPeriod } from "./date.js";
import { escapeHtml } from "./html.js";

export function formatPromoResult(result: CreatePromoResult): string {
  if (result.isFsm) {
    if (!result.createdPromoPartner) {
      return `ℹ️ <b>FSM промо вже існує</b>\n\nPartner: ${escapeHtml(result.partner.name)}\nПромо: ${escapeHtml(result.promo.name)}`;
    }
    return [
      `✅ <b>${result.createdPromo ? "FSM промо додано" : "FSM промо для партнера додано"}</b>`, "",
      "Тип: FSM", `Промо: ${escapeHtml(result.promo.name)}`,
      `LOB: ${escapeHtml(result.promo.lob)}`,
      `Partner: ${escapeHtml(result.partner.name)}`,
      `Period: ${formatCompactPeriod(result.promo.startDate, result.promo.endDate)}`,
    ].join("\n");
  }
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
