import type { CurrentUser, PromoDto } from "../../types";

export const canManagePromos = (user: CurrentUser): boolean => user.role === "SUPERUSER";
export const canMutateReports = (user: CurrentUser): boolean => user.role !== "PLM";
export const canExpandPromoPartners = (user: CurrentUser): boolean => user.role !== "PLM";
export const removePromoFromState = (promos: PromoDto[], promoId: string): PromoDto[] => promos.filter((promo) => promo.id !== promoId);
export const removePartnerFromState = (promos: PromoDto[], promoId: string, partnerId: string): PromoDto[] => promos.map((promo) => promo.id === promoId ? { ...promo, partners: promo.partners.filter((partner) => partner.partnerId !== partnerId) } : promo);
