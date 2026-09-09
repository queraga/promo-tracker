import { prisma } from "../../shared/db/prisma.js";

export function getPromoById(id: string) {
  return prisma.promo.findUnique({
    where: { id },
    include: { partners: { include: { partner: true } } },
  });
}
