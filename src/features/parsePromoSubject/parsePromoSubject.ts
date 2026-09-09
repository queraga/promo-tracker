import type { ParsedPromoSubject } from "./parsePromoSubject.types.js";
import {
  buildPromoName,
  detectLob,
  extractDateRanges,
  extractPartner,
  normalizePromoName,
  stripEmailPrefixes,
  uniqueWarnings,
} from "./parsePromoSubject.utils.js";

export type { Lob, ParsedPromoSubject } from "./parsePromoSubject.types.js";

export function parsePromoSubject(
  subject: string,
  currentDate: Date = new Date(),
): ParsedPromoSubject {
  const rawSubject = subject;
  const cleanedSubject = stripEmailPrefixes(subject);
  const partner = extractPartner(cleanedSubject);
  const lob = detectLob(cleanedSubject);
  const dateExtraction = extractDateRanges(cleanedSubject, currentDate);
  const promoName = buildPromoName(cleanedSubject, partner);
  const warnings: string[] = [];

  if (!partner) warnings.push("Partner could not be detected");
  if (!lob) warnings.push("LOB could not be detected");
  if (dateExtraction.warning) warnings.push(dateExtraction.warning);
  if (!promoName) warnings.push("Promo name could not be determined");

  const unique = uniqueWarnings(warnings);
  return {
    rawSubject,
    partner,
    lob,
    promoName,
    startDate: dateExtraction.period?.startDate ?? null,
    endDate: dateExtraction.period?.endDate ?? null,
    normalizedName: normalizePromoName(promoName),
    isValid:
      partner !== null &&
      lob !== null &&
      dateExtraction.period !== null &&
      promoName.length > 0,
    warnings: unique,
  };
}
