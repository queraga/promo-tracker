import type { CreditPromoMetadata } from "../creditPromo/creditPromo.js";

export type Lob = "iPhone" | "AW" | "AirPods" | "AW & AirPods" | "Mac" | "iPad" | "Mac iPad" | "ACCY";

export type ParsedPromoSubject = {
  rawSubject: string;
  isFsm: boolean;
  credit: CreditPromoMetadata | null;
  allLob: boolean;
  classificationConflict: "fsm-credit" | "credit-signals" | null;
  partner: string | null;
  /** Selected canonical partners for validated multi-partner CREDIT input. */
  selectedPartners?: string[];
  /** A structurally designated but invalid CREDIT partner list. */
  partnerListError?: "incomplete" | "ambiguous" | "too-few";
  partnerCandidates: string[];
  lob: Lob | null;
  promoName: string;
  startDate: string | null;
  endDate: string | null;
  normalizedName: string;
  isValid: boolean;
  warnings: string[];
};
