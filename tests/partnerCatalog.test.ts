import { beforeEach, describe, expect, it } from "vitest";
import { getPartnerNames } from "../src/features/partnerQueries/getPartnerNames.js";
import { CANONICAL_PARTNERS } from "../src/features/parsePromoSubject/parsePromoSubject.config.js";
import { prisma } from "../src/shared/db/prisma.js";

beforeEach(async () => { await prisma.partner.deleteMany(); });

describe("partner catalog", () => {
  it("returns all 29 canonical partners in business order", async () => {
    expect(CANONICAL_PARTNERS).toHaveLength(29);
    expect(await getPartnerNames()).toEqual(CANONICAL_PARTNERS);
  });
  it("appends legacy partners stored in the database without duplicating canonical names", async () => {
    await prisma.partner.createMany({ data: [{ name: "ЖЖУК" }, { name: "Rozetka" }, { name: "Legacy Store" }] });
    const partners = await getPartnerNames();
    expect(partners.slice(0, 29)).toEqual(CANONICAL_PARTNERS);
    expect(partners.slice(29)).toEqual(["Legacy Store", "ЖЖУК"]);
    expect(partners.filter((name) => name === "Rozetka")).toHaveLength(1);
  });
});
