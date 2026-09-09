import type { getAllPromos } from "../../features/promoQueries/getAllPromos.js";
import { getPromoStatus } from "../../entities/promo/getPromoStatus.js";
import { formatActivePromos } from "../formatters/formatActivePromos.js";

type Promos = Awaited<ReturnType<typeof getAllPromos>>;

export async function getActivePromoView(
  loadPromos: () => Promise<Promos>,
  currentDate: Date = new Date(),
): Promise<string> {
  const promos = (await loadPromos()).filter(
    (promo) => getPromoStatus(promo.startDate, promo.endDate, currentDate) === "active",
  );
  return formatActivePromos(promos);
}
