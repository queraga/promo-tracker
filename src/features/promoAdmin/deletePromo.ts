import { prisma } from "../../shared/db/prisma.js";

export async function deletePromo(promoId: string): Promise<boolean> {
  return prisma.$transaction(async (transaction) => {
    const promo = await transaction.promo.findUnique({ where: { id: promoId }, select: { id: true } });
    if (!promo) return false;
    await transaction.promo.delete({ where: { id: promoId } });
    return true;
  });
}

export async function removePromoPartner(promoId: string, partnerId: string): Promise<boolean> {
  const result = await prisma.promoPartner.deleteMany({ where: { promoId, partnerId } });
  return result.count === 1;
}
