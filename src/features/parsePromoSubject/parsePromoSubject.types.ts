export type Lob = "iPhone" | "AW" | "AirPods" | "AW & AirPods" | "Mac iPad" | "ACCY";

export type ParsedPromoSubject = {
  rawSubject: string;
  partner: string | null;
  lob: Lob | null;
  promoName: string;
  startDate: string | null;
  endDate: string | null;
  normalizedName: string;
  isValid: boolean;
  warnings: string[];
};
