import { Prisma } from "@prisma/client";
import type { ParsedPromoSubject } from "../parsePromoSubject/parsePromoSubject.types.js";
import { prisma } from "../../shared/db/prisma.js";
import { withSqliteBusyRetry } from "../../shared/db/withSqliteBusyRetry.js";
import { parsePromoDate } from "../../shared/date/parsePromoDate.js";
import { classifyCreditPromo, isAllLobRequest, ATOMIC_CREDIT_LOBS } from "../creditPromo/creditPromo.js";
import { normalizeCreditPromoName, extractPartnerCandidates, extractCreditPartnerList, isFsmPromoSubject, selectCreditPromoPartners, stripEmailPrefixes } from "../parsePromoSubject/parsePromoSubject.utils.js";
import type { CreatePromoOperationResult, CreatePromoResult } from "./createPromo.types.js";
import { InvalidParsedPromoSubjectError } from "./createPromo.types.js";
import { assertReportingPeriodOpen } from "../quarterlyReporting/closedPeriods.js";

type TransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
const defaultTransactionRunner: TransactionRunner = (work) => prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
const supportedLobs = new Set(["iPhone", "AW", "AirPods", "AW & AirPods", "Mac", "iPad", "Mac iPad", "ACCY"]);

export async function createPromoOperationFromParsedSubject(
  parsed: ParsedPromoSubject,
  runTransaction: TransactionRunner = defaultTransactionRunner,
): Promise<CreatePromoOperationResult> {
  const raw = stripEmailPrefixes(parsed.rawSubject);
  const rawSubjectIsFsm = isFsmPromoSubject(raw);
  const rawPartnerCandidates = extractPartnerCandidates(raw);
  const rawCreditClassification = classifyCreditPromo(raw);
  const rawCredit = rawCreditClassification?.kind === "credit" ? rawCreditClassification.metadata : null;
  const rawConflict = rawCreditClassification?.kind === "conflict"
    ? "credit-signals"
    : rawSubjectIsFsm && rawCredit ? "fsm-credit" : null;
  const rawAllLob = rawCredit !== null && rawConflict === null && isAllLobRequest(raw);
  const rawCreditPartnerList = rawCredit !== null && !rawSubjectIsFsm && rawConflict === null
    ? extractCreditPartnerList(raw)
    : null;
  const multiPartners = parsed.selectedPartners;
  const rawSelectedPartners = rawCredit !== null && !rawSubjectIsFsm && rawConflict === null
    ? selectCreditPromoPartners(rawCreditPartnerList)
    : undefined;
  if (
    !parsed.isValid ||
    parsed.isFsm !== rawSubjectIsFsm ||
    parsed.classificationConflict !== rawConflict ||
    parsed.allLob !== rawAllLob ||
    JSON.stringify(parsed.credit) !== JSON.stringify(rawCredit) ||
    (multiPartners !== undefined && (
      !rawCredit || rawSubjectIsFsm || rawConflict !== null ||
      JSON.stringify(multiPartners) !== JSON.stringify(rawSelectedPartners) ||
      multiPartners.length < 2 || parsed.partner !== multiPartners[0]
    )) ||
    (rawSelectedPartners?.length === 1 && parsed.partner !== rawSelectedPartners[0]) ||
    (rawCreditPartnerList?.error !== null && rawCreditPartnerList !== null) ||
    (rawSelectedPartners && rawSelectedPartners.length > 1 && !multiPartners) ||
    (rawSubjectIsFsm && (rawPartnerCandidates.length !== 1 || parsed.partner !== rawPartnerCandidates[0])) ||
    !parsed.partner ||
    (!parsed.lob && !parsed.allLob) ||
    (parsed.lob !== null && !supportedLobs.has(parsed.lob)) ||
    (parsed.allLob && (!parsed.credit || parsed.isFsm)) ||
    !parsed.startDate ||
    !parsed.endDate ||
    !parsed.promoName
  ) {
    throw new InvalidParsedPromoSubjectError();
  }

  const startDate = parsePromoDate(parsed.startDate);
  const endDate = parsePromoDate(parsed.endDate);
  const targetLobs = parsed.allLob ? [...ATOMIC_CREDIT_LOBS] : [parsed.lob!];
  const partnerNames = multiPartners ?? [parsed.partner!];

  const promos = await withSqliteBusyRetry(() => runTransaction(async (tx) => {
    // Check every target before the first write, so a CLOSED LOB rejects the
    // logical batch without persisting even its OPEN siblings.
    for (const lob of targetLobs) await assertReportingPeriodOpen({ lob, endDate }, tx);

    const partners = new Map<string, { partner: Awaited<ReturnType<typeof tx.partner.upsert>>; existed: boolean }>();
    for (const name of partnerNames) {
      const existingPartner = await tx.partner.findUnique({ where: { name } });
      const partner = await tx.partner.upsert({ where: { name }, create: { name }, update: {} });
      partners.set(name, { partner, existed: existingPartner !== null });
    }
    const normalizedName = parsed.isFsm
      ? `!fsm:${encodeURIComponent(parsed.partner!)}:${parsed.normalizedName}`
      : parsed.credit ? normalizeCreditPromoName(parsed.promoName) : parsed.normalizedName;

    const results: CreatePromoResult[] = [];
    for (const lob of targetLobs) {
      const promoKey = { lob_normalizedName_startDate_endDate: { lob, normalizedName, startDate, endDate } };
      const existingPromo = await tx.promo.findUnique({ where: { lob_normalizedName_startDate_endDate: promoKey.lob_normalizedName_startDate_endDate } });
      const promo = await tx.promo.upsert({
        where: promoKey,
        create: { lob, name: parsed.promoName, normalizedName, startDate, endDate },
        update: {},
      });
      for (const name of partnerNames) {
        const { partner, existed } = partners.get(name)!;
        const relationKey = { promoId_partnerId: { promoId: promo.id, partnerId: partner.id } };
        const existingPromoPartner = await tx.promoPartner.findUnique({ where: relationKey });
        const promoPartner = await tx.promoPartner.upsert({
          where: relationKey,
          create: { promoId: promo.id, partnerId: partner.id, rawEmailSubject: parsed.rawSubject },
          update: { rawEmailSubject: parsed.rawSubject },
        });
        results.push({
          promo,
          partner,
          promoPartner,
          createdPromo: existingPromo === null,
          createdPartner: !existed,
          createdPromoPartner: existingPromoPartner === null,
          isFsm: parsed.isFsm,
          credit: parsed.credit,
        });
      }
    }
    return results;
  }));
  return { promos, allLob: parsed.allLob, credit: parsed.credit };
}

// Compatibility wrapper for existing one-Promo domain callers and tests.
export async function createPromoFromParsedSubject(parsed: ParsedPromoSubject): Promise<CreatePromoResult> {
  if (parsed.allLob) throw new InvalidParsedPromoSubjectError();
  const result = await createPromoOperationFromParsedSubject(parsed);
  return result.promos[0]!;
}
