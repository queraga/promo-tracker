import { prisma } from "../../shared/db/prisma.js";

export function getPromoPartnerById(id: string) {
  return prisma.promoPartner.findUnique({ where: { id } });
}
