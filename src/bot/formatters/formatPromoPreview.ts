import type { ParsedPromoSubject } from "../../features/parsePromoSubject/parsePromoSubject.types.js";
import { formatFullDate } from "./date.js";
import { escapeHtml } from "./html.js";

export function formatPromoPreview(parsed: ParsedPromoSubject): string {
  const lob = parsed.lob ? escapeHtml(parsed.lob) : "not detected";
  const partner = parsed.partner ? escapeHtml(parsed.partner) : "not detected";
  const period = parsed.startDate && parsed.endDate
    ? `${formatFullDate(parsed.startDate)} - ${formatFullDate(parsed.endDate)}`
    : "not detected";

  if (!parsed.isValid) {
    return [
      "⚠️ <b>Не вдалося повністю розпізнати промо</b>", "",
      `LOB: ${lob}`, `Partner: ${partner}`, `Period: ${period}`, "", "Warnings:",
      ...parsed.warnings.map((warning) => `- ${escapeHtml(warning)}`), "",
      "Виправте subject і надішліть його ще раз.",
    ].join("\n");
  }

  return [
    "📋 <b>Promo detected</b>", "", `LOB: ${lob}`, `Partner: ${partner}`,
    `Period: ${period}`, "", "Promo:", escapeHtml(parsed.promoName),
  ].join("\n");
}
