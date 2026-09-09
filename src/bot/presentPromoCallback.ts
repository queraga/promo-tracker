import { formatPromoResult } from "./formatters/formatPromoResult.js";
import type { PromoCallbackResult } from "./workflows/promoCallbackWorkflow.js";

export function presentPromoCallback(result: PromoCallbackResult): { text: string; answer: string } {
  if (result.kind === "added") return { text: formatPromoResult(result.result), answer: "Done" };
  if (result.kind === "cancelled") return { text: "❌ Скасовано", answer: "Скасовано" };
  if (result.kind === "expired") {
    return {
      text: "Це підтвердження вже застаріло. Надішліть subject ще раз.",
      answer: "Confirmation expired",
    };
  }
  if (result.kind === "forbidden") {
    return { text: "Це підтвердження належить іншому користувачу.", answer: "Unavailable" };
  }
  return { text: "Це підтвердження вже використано або не існує.", answer: "Unavailable" };
}
