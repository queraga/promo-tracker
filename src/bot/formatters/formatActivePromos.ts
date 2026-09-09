import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { formatCompactPeriod } from "./date.js";
import { escapeHtml } from "./html.js";

type PromoWithPartners = Promo & { partners: Array<PromoPartner & { partner: Partner }> };

export function formatActivePromos(promos: PromoWithPartners[]): string {
  if (promos.length === 0) return "Немає активних промо.";
  return ["<b>Active promos</b>", ...promos.map((promo) => [
    `🟢 <b>${escapeHtml(promo.lob)}</b>`,
    formatCompactPeriod(promo.startDate, promo.endDate), escapeHtml(promo.name),
    `Partners: ${promo.partners.map(({ partner }) => escapeHtml(partner.name)).join(", ")}`,
  ].join("\n"))].join("\n\n");
}
