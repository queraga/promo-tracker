import type { ParsedPromoSubject } from "../../features/parsePromoSubject/parsePromoSubject.types.js";
import { formatFullDate } from "./date.js";
import { escapeHtml } from "./html.js";

export function formatPromoPreview(parsed: ParsedPromoSubject): string {
  const lob = parsed.lob ? `${escapeHtml(parsed.lob)} ✓` : "не знайдено";
  const partner = parsed.partner
    ? `${escapeHtml(parsed.partner)} ✓`
    : parsed.isFsm && parsed.partnerCandidates.length > 1
      ? escapeHtml(parsed.partnerCandidates.join(", "))
      : "не знайдено";
  const period = parsed.startDate && parsed.endDate
    ? `${formatFullDate(parsed.startDate)} - ${formatFullDate(parsed.endDate)} ✓`
    : "не знайдено";

  if (!parsed.isValid) {
    const guidance = [
      !parsed.lob && "Не вдалося визначити LOB. Додайте його у форматі LOB: iPhone.",
      parsed.isFsm && parsed.partnerCandidates.length === 0 && "Не вдалося визначити партнера для FSM промо. Додайте одного партнера.",
      parsed.isFsm && parsed.partnerCandidates.length > 1 && "FSM промо має бути прив'язане до одного партнера. Вкажіть одного партнера.",
      !parsed.isFsm && !parsed.partner && "Не вдалося визначити партнера. Додайте його у форматі Partner: Citrus.",
      !(parsed.startDate && parsed.endDate) && "Не вдалося визначити період. Додайте його у форматі 28.09-04.10.",
    ].filter((line): line is string => Boolean(line));
    return [
      `⚠️ <b>${parsed.isFsm ? "Не вдалося розпізнати FSM промо" : "Не вдалося повністю розпізнати промо"}</b>`, "",
      ...(parsed.isFsm ? ["Тип: FSM"] : []),
      `LOB: ${lob}`, `Partner: ${partner}`, `Period: ${period}`, "",
      ...guidance, "", "Доповніть дані та надішліть повідомлення ще раз.",
    ].join("\n");
  }

  return [
    `📋 <b>${parsed.isFsm ? "FSM промо розпізнано" : "Промо розпізнано"}</b>`, "",
    ...(parsed.isFsm ? ["Тип: FSM"] : []),
    `LOB: ${lob}`, `Partner: ${partner}`,
    `Period: ${period}`, "", "Промо:", escapeHtml(parsed.promoName),
  ].join("\n");
}
