import { prisma } from "../../shared/db/prisma.js";
import { excludeClosedPeriodPromos } from "../quarterlyReporting/closedPeriods.js";

export async function getAllPromos() {
  return excludeClosedPeriodPromos(await prisma.promo.findMany({ include: { partners: { include: { partner: true } } } }));
}
