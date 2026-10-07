import type { Partner, Promo, PromoPartner } from "@prisma/client";
import type { CreditPromoMetadata } from "../creditPromo/creditPromo.js";

export type CreatePromoResult = {
  promo: Promo;
  partner: Partner;
  promoPartner: PromoPartner;
  createdPromo: boolean;
  createdPartner: boolean;
  createdPromoPartner: boolean;
  isFsm: boolean;
  credit: CreditPromoMetadata | null;
};

export type CreatePromoOperationResult = { promos: CreatePromoResult[]; allLob: boolean; credit: CreditPromoMetadata | null };

export class InvalidParsedPromoSubjectError extends Error {
  constructor() {
    super("Cannot persist an invalid parsed promo subject");
    this.name = "InvalidParsedPromoSubjectError";
  }
}
