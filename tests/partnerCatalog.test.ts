import { beforeEach, describe, expect, it } from "vitest";
import { getPartnerNames } from "../src/features/partnerQueries/getPartnerNames.js";
import { CANONICAL_PARTNERS } from "../src/features/parsePromoSubject/parsePromoSubject.config.js";
import { prisma } from "../src/shared/db/prisma.js";

beforeEach(async () => { await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany(); });

async function associatePartner(name: string, suffix: string) {
  return prisma.promo.create({ data: {
    lob: "AW", name: `Promo ${suffix}`, normalizedName: `promo ${suffix}`,
    startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-09-02T00:00:00.000Z"),
    partners: { create: { rawEmailSubject: `AW <Promo ${suffix}> - ${name}`, partner: { connectOrCreate: { where: { name }, create: { name } } } } },
  } });
}

describe("partner catalog", () => {
  it("keeps all 29 canonical partners available to the parser without exposing unused partners", async () => {
    expect(CANONICAL_PARTNERS).toHaveLength(29);
    expect(await getPartnerNames()).toEqual([]);
  });
  it("returns only canonical and legacy partners associated with real promos", async () => {
    await prisma.partner.createMany({ data: [{ name: "Comfy" }, { name: "Unused Legacy" }] });
    await associatePartner("Rozetka", "one");
    await associatePartner("Epicentr", "two");
    await associatePartner("ЖЖУК", "three");
    expect(await getPartnerNames()).toEqual(["Epicentr", "Rozetka", "ЖЖУК"]);
  });
  it("automatically exposes a newly associated canonical partner", async () => {
    await associatePartner("Rozetka", "one");
    expect(await getPartnerNames()).toEqual(["Rozetka"]);
    await associatePartner("Brain", "two");
    await associatePartner("KTC", "three");
    expect(await getPartnerNames()).toEqual(["KTC", "Rozetka", "Brain"]);
  });
});
