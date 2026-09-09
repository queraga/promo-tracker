import type { Partner, Promo, PromoPartner } from "@prisma/client";

export type CreatePromoResult = {
  promo: Promo;
  partner: Partner;
  promoPartner: PromoPartner;
  createdPromo: boolean;
  createdPartner: boolean;
  createdPromoPartner: boolean;
};

export class InvalidParsedPromoSubjectError extends Error {
  constructor() {
    super("Cannot persist an invalid parsed promo subject");
    this.name = "InvalidParsedPromoSubjectError";
  }
}
