import type { ParsedPromoSubject } from "../parsePromoSubject/parsePromoSubject.types.js";
import { prisma } from "../../shared/db/prisma.js";
import { parsePromoDate } from "../../shared/date/parsePromoDate.js";
import {
  InvalidParsedPromoSubjectError,
  type CreatePromoResult,
} from "./createPromo.types.js";

export async function createPromoFromParsedSubject(
  parsed: ParsedPromoSubject,
): Promise<CreatePromoResult> {
  if (
    !parsed.isValid ||
    !parsed.partner ||
    !parsed.lob ||
    !parsed.startDate ||
    !parsed.endDate ||
    !parsed.promoName
  ) {
    throw new InvalidParsedPromoSubjectError();
  }

  const startDate = parsePromoDate(parsed.startDate);
  const endDate = parsePromoDate(parsed.endDate);

  return prisma.$transaction(async (tx) => {
    const promoKey = {
      lob_normalizedName_startDate_endDate: {
        lob: parsed.lob!,
        normalizedName: parsed.normalizedName,
        startDate,
        endDate,
      },
    };
    const existingPromo = await tx.promo.findUnique({ where: promoKey });
    const promo = await tx.promo.upsert({
      where: promoKey,
      create: {
        lob: parsed.lob!,
        name: parsed.promoName,
        normalizedName: parsed.normalizedName,
        startDate,
        endDate,
      },
      update: {},
    });

    const existingPartner = await tx.partner.findUnique({ where: { name: parsed.partner! } });
    const partner = await tx.partner.upsert({
      where: { name: parsed.partner! },
      create: { name: parsed.partner! },
      update: {},
    });

    const relationKey = {
      promoId_partnerId: { promoId: promo.id, partnerId: partner.id },
    };
    const existingPromoPartner = await tx.promoPartner.findUnique({ where: relationKey });
    const promoPartner = await tx.promoPartner.upsert({
      where: relationKey,
      create: {
        promoId: promo.id,
        partnerId: partner.id,
        rawEmailSubject: parsed.rawSubject,
      },
      update: { rawEmailSubject: parsed.rawSubject },
    });

    return {
      promo,
      partner,
      promoPartner,
      createdPromo: existingPromo === null,
      createdPartner: existingPartner === null,
      createdPromoPartner: existingPromoPartner === null,
    };
  });
}
