import { prisma } from "../../shared/db/prisma.js";

export function getAllPromos() {
  return prisma.promo.findMany({ include: { partners: { include: { partner: true } } } });
}
