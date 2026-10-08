import type { ParsedPromoSubject } from "./parsePromoSubject.types.js";
import { classifyCreditPromo, isAllLobRequest } from "../creditPromo/creditPromo.js";
import {
  buildCreditPromoName,
  buildFsmPromoName,
  buildPromoName,
  detectLob,
  extractDateRanges,
  extractPartner,
  extractPartnerCandidates,
  extractCreditPartnerList,
  isFsmPromoSubject,
  normalizePromoName,
  normalizeCreditPromoName,
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
  const creditClassification = classifyCreditPromo(cleanedSubject);
  const credit = creditClassification?.kind === "credit" ? creditClassification.metadata : null;
  const classificationConflict = creditClassification?.kind === "conflict"
    ? "credit-signals"
    : isFsm && credit ? "fsm-credit" : null;
  const allLob = credit !== null && classificationConflict === null && isAllLobRequest(cleanedSubject);
  const partnerCandidates = extractPartnerCandidates(cleanedSubject);
  const creditPartnerList = credit && !isFsm && classificationConflict === null
    ? extractCreditPartnerList(cleanedSubject)
    : null;
  const selectedPartners = creditPartnerList?.error === null && (creditPartnerList.partners.length > 1 || creditPartnerList.explicit)
    ? creditPartnerList.partners
    : undefined;
  const partner = selectedPartners?.[0] ?? (isFsm
    ? partnerCandidates.length === 1 ? partnerCandidates[0] : null
    : extractPartner(cleanedSubject));
  const lob = allLob ? null : detectLob(cleanedSubject);
  const dateExtraction = extractDateRanges(cleanedSubject, currentDate);
  const promoName = isFsm
    ? buildFsmPromoName(cleanedSubject, partner)
    : credit ? buildCreditPromoName(cleanedSubject, partner, creditPartnerList?.line) : buildPromoName(cleanedSubject, partner);
  const warnings: string[] = [];

  if (!partner) warnings.push("Partner could not be detected");
  if (creditPartnerList?.error) {
    warnings.push("Credit partner list is incomplete or ambiguous. Use Partners: Rozetka, Kibernetiki for the complete list.");
  }
  if (isFsm && partnerCandidates.length > 1) {
    warnings.push("FSM promo must have exactly one recognized partner");
  }
  if (classificationConflict === "fsm-credit") warnings.push("FSM і кредитне промо мають несумісні типи");
  if (classificationConflict === "credit-signals") warnings.push("Не вдалося однозначно визначити банк або кредитну механіку");
  if (!lob && !allLob) warnings.push("LOB could not be detected");
  if (dateExtraction.warning) warnings.push(dateExtraction.warning);
  if (!promoName) warnings.push("Promo name could not be determined");

  const unique = uniqueWarnings(warnings);
  return {
    rawSubject,
    isFsm,
    credit,
    allLob,
    classificationConflict,
    partner,
    ...(selectedPartners && selectedPartners.length > 1 ? { selectedPartners } : {}),
    ...(creditPartnerList?.error ? { partnerListError: creditPartnerList.error } : {}),
    partnerCandidates,
    lob,
    promoName,
    startDate: dateExtraction.period?.startDate ?? null,
    endDate: dateExtraction.period?.endDate ?? null,
    normalizedName: credit ? normalizeCreditPromoName(promoName) : normalizePromoName(promoName),
    isValid:
      partner !== null &&
      creditPartnerList?.error == null &&
      (!isFsm || partnerCandidates.length === 1) &&
      classificationConflict === null &&
      (lob !== null || allLob) &&
      dateExtraction.period !== null &&
      promoName.length > 0,
    warnings: unique,
  };
}
