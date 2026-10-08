import type { ParsedPromoSubject } from "../../features/parsePromoSubject/parsePromoSubject.types.js";
import { formatFullDate } from "./date.js";
import { escapeHtml } from "./html.js";

export function formatPromoPreview(parsed: ParsedPromoSubject): string {
  const lob = parsed.allLob ? "All ✓" : parsed.lob ? `${escapeHtml(parsed.lob)} ✓` : "не знайдено";
  const partner = parsed.selectedPartners && parsed.selectedPartners.length > 1
    ? `${parsed.selectedPartners.map(escapeHtml).join(", ")} ✓`
    : parsed.partner
    ? `${escapeHtml(parsed.partner)} ✓`
    : parsed.isFsm && parsed.partnerCandidates.length > 1
      ? escapeHtml(parsed.partnerCandidates.join(", "))
      : "не знайдено";
  const period = parsed.startDate && parsed.endDate
    ? `${formatFullDate(parsed.startDate)} - ${formatFullDate(parsed.endDate)} ✓`
    : "не знайдено";

  if (!parsed.isValid) {
    const guidance = [
      parsed.classificationConflict === "fsm-credit" && "FSM і кредитні маркери не можна поєднувати. Надішліть промо одного типу.",
      parsed.classificationConflict === "credit-signals" && "Вкажіть одну кредитну механіку та один банк.",
      parsed.partnerListError && "Не вдалося повністю розпізнати список партнерів. Використайте формат Partners: Rozetka, Kibernetiki, iSpace.",
      !parsed.lob && !parsed.allLob && "Не вдалося визначити LOB. Додайте його у форматі LOB: iPhone або використайте all LOB для кредитного промо.",
      parsed.isFsm && parsed.partnerCandidates.length === 0 && "Не вдалося визначити партнера для FSM промо. Додайте одного партнера.",
      parsed.isFsm && parsed.partnerCandidates.length > 1 && "FSM промо має бути прив'язане до одного партнера. Вкажіть одного партнера.",
      !parsed.isFsm && !parsed.partner && "Не вдалося визначити партнера. Додайте його у форматі Partner: Citrus.",
      !(parsed.startDate && parsed.endDate) && "Не вдалося визначити період. Додайте його у форматі 28.09-04.10.",
    ].filter((line): line is string => Boolean(line));
    return [
      `⚠️ <b>${parsed.isFsm ? "Не вдалося розпізнати FSM промо" : parsed.credit ? "Не вдалося розпізнати кредитне промо" : "Не вдалося повністю розпізнати промо"}</b>`, "",
      ...(parsed.isFsm ? ["Тип: FSM"] : []),
      ...(parsed.credit ? [`Bank: ${parsed.credit.bank === "MONO" ? "mono" : "ПриватБанк"}`, ...(parsed.credit.mechanic ? [`Mechanic: ${escapeHtml(parsed.credit.mechanic)}`] : [])] : []),
      `LOB: ${lob}`, `${parsed.selectedPartners && parsed.selectedPartners.length > 1 ? "Partners" : "Partner"}: ${partner}`, `Period: ${period}`, "",
      ...guidance, "", "Доповніть дані та надішліть повідомлення ще раз.",
    ].join("\n");
  }

  return [
    `📋 <b>${parsed.isFsm ? "FSM промо розпізнано" : parsed.credit ? "Кредитне промо розпізнано" : "Промо розпізнано"}</b>`, "",
    ...(parsed.isFsm ? ["Тип: FSM"] : []),
    ...(parsed.credit ? [`Bank: ${parsed.credit.bank === "MONO" ? "mono" : "ПриватБанк"}`, ...(parsed.credit.mechanic ? [`Mechanic: ${escapeHtml(parsed.credit.mechanic)}`] : [])] : []),
    `LOB: ${lob}`, `${parsed.selectedPartners && parsed.selectedPartners.length > 1 ? "Partners" : "Partner"}: ${partner}`,
    `Period: ${period}`,
    ...(parsed.allLob ? ["Буде створено: 6 промо", "iPhone, Mac, iPad, AW, AirPods, ACCY"] : []),
    "", "Промо:", escapeHtml(parsed.promoName),
  ].join("\n");
}
