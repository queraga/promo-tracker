import type { CreatePromoOperationResult } from "../../features/createPromo/createPromo.types.js";
import { formatCompactPeriod } from "./date.js";
import { escapeHtml } from "./html.js";

export function formatPromoResult(operation: CreatePromoOperationResult): string {
  const result = operation.promos[0]!;
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
  if (operation.credit) {
    const bank = operation.credit.bank === "MONO" ? "mono" : "ПриватБанк";
    const mechanic = operation.credit.mechanic ? ` · ${escapeHtml(operation.credit.mechanic)}` : "";
    const partnerNames = [...new Set(operation.promos.map(({ partner }) => partner.name))];
    const multiPartner = partnerNames.length > 1;
    if (operation.allLob) {
      const allRelationsAlreadyExisted = operation.promos.every(({ createdPromoPartner }) => !createdPromoPartner);
      if (multiPartner) {
        const lobs = [...new Set(operation.promos.map(({ promo }) => promo.lob))];
        return [
          `✅ <b>${allRelationsAlreadyExisted ? "Кредитне промо вже існує" : "Кредитне промо додано"}</b>`, "",
          `${bank}${mechanic}`, `Partners: ${partnerNames.map(escapeHtml).join(", ")}`,
          `6 LOB: ${lobs.map(escapeHtml).join(", ")}`,
        ].join("\n");
      }
      return [
        `✅ <b>${allRelationsAlreadyExisted ? "Кредитне промо вже існує" : "Кредитне промо додано"}</b>`, "",
        `${bank}${mechanic}`, escapeHtml(result.partner.name),
        `6 LOB: ${operation.promos.map(({ promo }) => escapeHtml(promo.lob)).join(", ")}`,
      ].join("\n");
    }
    if (multiPartner) {
      const allRelationsAlreadyExisted = operation.promos.every(({ createdPromoPartner }) => !createdPromoPartner);
      return [
        `✅ <b>${allRelationsAlreadyExisted ? "Кредитне промо вже існує" : "Кредитне промо додано"}</b>`, "",
        `${bank}${mechanic}`, `LOB: ${escapeHtml(result.promo.lob)}`,
        `Partners: ${partnerNames.map(escapeHtml).join(", ")}`,
        `Period: ${formatCompactPeriod(result.promo.startDate, result.promo.endDate)}`,
        `Промо: ${escapeHtml(result.promo.name)}`,
      ].join("\n");
    }
    if (!result.createdPromoPartner) return `ℹ️ <b>Кредитне промо вже існує</b>\n\n${bank}${mechanic}\nPartner: ${escapeHtml(result.partner.name)}\nПромо: ${escapeHtml(result.promo.name)}`;
    return [
      `✅ <b>${result.createdPromo ? "Кредитне промо додано" : "Кредитне промо для партнера додано"}</b>`, "",
      `${bank}${mechanic}`, `LOB: ${escapeHtml(result.promo.lob)}`,
      `Partner: ${escapeHtml(result.partner.name)}`,
      `Period: ${formatCompactPeriod(result.promo.startDate, result.promo.endDate)}`,
      `Промо: ${escapeHtml(result.promo.name)}`,
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
