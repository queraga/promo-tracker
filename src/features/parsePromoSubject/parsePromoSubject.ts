import type { ParsedPromoSubject } from "./parsePromoSubject.types.js";
import {
  buildFsmPromoName,
  buildPromoName,
  detectLob,
  extractDateRanges,
  extractPartner,
  extractPartnerCandidates,
  isFsmPromoSubject,
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
  const isFsm = isFsmPromoSubject(cleanedSubject);
  const partnerCandidates = extractPartnerCandidates(cleanedSubject);
  const partner = isFsm
    ? partnerCandidates.length === 1 ? partnerCandidates[0] : null
    : extractPartner(cleanedSubject);
  const lob = detectLob(cleanedSubject);
  const dateExtraction = extractDateRanges(cleanedSubject, currentDate);
  const promoName = isFsm
    ? buildFsmPromoName(cleanedSubject, partner)
    : buildPromoName(cleanedSubject, partner);
  const warnings: string[] = [];

  if (!partner) warnings.push("Partner could not be detected");
  if (isFsm && partnerCandidates.length > 1) {
    warnings.push("FSM promo must have exactly one recognized partner");
  }
  if (!lob) warnings.push("LOB could not be detected");
  if (dateExtraction.warning) warnings.push(dateExtraction.warning);
  if (!promoName) warnings.push("Promo name could not be determined");

  const unique = uniqueWarnings(warnings);
  return {
    rawSubject,
    isFsm,
    partner,
    partnerCandidates,
    lob,
    promoName,
    startDate: dateExtraction.period?.startDate ?? null,
    endDate: dateExtraction.period?.endDate ?? null,
    normalizedName: normalizePromoName(promoName),
    isValid:
      partner !== null &&
      (!isFsm || partnerCandidates.length === 1) &&
      lob !== null &&
      dateExtraction.period !== null &&
      promoName.length > 0,
    warnings: unique,
  };
}
