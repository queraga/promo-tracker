import { describe, expect, it } from "vitest";
import { parsePromoSubject } from "../src/features/parsePromoSubject/parsePromoSubject.js";
import { CANONICAL_PARTNERS, PARTNER_ALIASES } from "../src/features/parsePromoSubject/parsePromoSubject.config.js";

const now = new Date("2026-09-09T10:00:00");

describe("parsePromoSubject", () => {
  it("recognizes all 29 canonical partner names", () => {
    expect(CANONICAL_PARTNERS).toHaveLength(29);
    for (const canonical of CANONICAL_PARTNERS) {
      expect(parsePromoSubject(`Promo iPhone 07.09-13.09 - ${canonical}`, now).partner).toBe(canonical);
    }
  });

  it("recognizes every configured alias with case and separator normalization", () => {
    for (const [canonical, aliases] of Object.entries(PARTNER_ALIASES)) {
      for (const alias of aliases) {
        const upper = alias.toLocaleUpperCase();
        expect(parsePromoSubject(`Promo iPhone 07.09-13.09 — ${upper}`, now).partner).toBe(canonical);
        const spaced = alias.replace(/[.\-_\s]+/gu, " / ");
        expect(parsePromoSubject(`Promo iPhone 07.09-13.09 - ${spaced}`, now).partner).toBe(canonical);
      }
    }
  });

  it.each([
    ["citrus", "Citrus"], ["Цитрус", "Citrus"],
    ["allo", "ALLO"], ["АЛЛО", "ALLO"], ["allo.ua", "ALLO"],
    ["KTC", "KTC"], ["ктс", "KTC"],
    ["iSpace", "iSpace"], ["ай спейс", "iSpace"],
    ["kibernetiki", "Kibernetiki"], ["Кібернетики", "Kibernetiki"], ["кибернетики", "Kibernetiki"],
    ["TTT", "TTT"], ["ттт", "TTT"],
    ["Epicentr", "Epicentr"], ["Епіцентр", "Epicentr"], ["Эпицентр", "Epicentr"],
    ["Brain", "Brain"], ["Брейн", "Brain"], ["brain.com.ua", "Brain"],
  ])("canonicalizes partner alias %s to %s", (alias, canonical) => {
    const result = parsePromoSubject(`Promo iPhone 07.09-13.09 - ${alias}`, now);
    expect(result).toMatchObject({ partner: canonical, promoName: "Promo iPhone", isValid: true });
    expect(result.warnings).not.toContain("Partner could not be detected");
  });

  it("parses the live ALLO regression subject", () => {
    const subject = "UPDATE! Промо по iPhone 17 Pro, 17 Pro Max, Air, 15, 16, 16e (07.09-13.09) - allo";
    expect(parsePromoSubject(subject, now)).toMatchObject({
      partner: "ALLO",
      lob: "iPhone",
      startDate: "2026-09-07",
      endDate: "2026-09-13",
      promoName: "Промо по iPhone 17 Pro, 17 Pro Max, Air, 15, 16, 16e",
      isValid: true,
      warnings: [],
    });
  });

  it("parses the production Accessories subject with reply prefix and trailing offer metadata", () => {
    const subject = "Re: Нова лінійка NPI Accessories Apple - Rozetka (Offer & Split) - 25.09 - 27.09";
    const result = parsePromoSubject(subject, now);

    expect(result).toMatchObject({
      lob: "ACCY",
      partner: "Rozetka",
      promoName: "Нова лінійка NPI Accessories Apple (Offer & Split)",
      startDate: "2026-09-25",
      endDate: "2026-09-27",
      isValid: true,
    });
    expect(result.warnings).not.toContain("LOB could not be detected");
    expect(result.warnings).not.toContain("Partner could not be detected");
  });

  it.each([
    ["Re: Нова лінійка NPI Accessories Apple - kibernetiki (Offer & Split) - 25.09 - 27.09", "Kibernetiki"],
    ["Нова лінійка NPI Accessories Apple - Rozetka (Offer & Split) - 25.09 - 27.09", "Rozetka"],
  ])("builds a partner-neutral shared name while preserving offer metadata: %s", (subject, partner) => {
    expect(parsePromoSubject(subject, now)).toMatchObject({
      partner,
      lob: "ACCY",
      promoName: "Нова лінійка NPI Accessories Apple (Offer & Split)",
      normalizedName: "нова лінійка npi accessories apple offer split",
      startDate: "2026-09-25",
      endDate: "2026-09-27",
      warnings: [],
    });
  });

  it("removes only the recognized trailing partner occurrence", () => {
    expect(parsePromoSubject("Kibernetiki Edition iPhone Promo - Rozetka (Offer & Split) - 25.09-27.09", now)).toMatchObject({
      partner: "Rozetka",
      promoName: "Kibernetiki Edition iPhone Promo (Offer & Split)",
    });
  });

  it.each([
    "Нова лінійка NPI Accessories Apple - Rozetka (Offer & Split) - 25.09 - 27.09",
    "RE: Нова лінійка NPI accessories Apple - ROZETKA (Offer & Split) - 25.09 - 27.09",
  ])("canonicalizes Accessories to ACCY across prefix and case variants: %s", (subject) => {
    expect(parsePromoSubject(subject, now)).toMatchObject({
      lob: "ACCY",
      partner: "Rozetka",
      startDate: "2026-09-25",
      endDate: "2026-09-27",
      warnings: [],
    });
  });

  it.each(["Accessories", "accessories", "ACCESSORIES", "ACCY", "accy"])(
    "canonicalizes the accessory LOB alias %s to ACCY",
    (alias) => {
      expect(parsePromoSubject(`NPI ${alias} Promo 25.09-27.09 - Rozetka`, now).lob).toBe("ACCY");
    },
  );

  it.each(["allo", "Allo", "ALLO", "Алло"])("keeps one canonical value across capitalization: %s", (alias) => {
    expect(parsePromoSubject(`Promo iPhone 07.09-13.09 - ${alias}`, now).partner).toBe("ALLO");
  });

  it.each(["Allotment", "MegaBrain", "Citrusade", "Epicentral"])("does not match partner-like substring: %s", (suffix) => {
    const result = parsePromoSubject(`Promo iPhone 07.09-13.09 - ${suffix}`, now);
    expect(result.partner).toBeNull();
    expect(result.warnings).toContain("Partner could not be detected");
  });

  it("keeps partner boundaries for a structured segment before the period", () => {
    const result = parsePromoSubject(
      "NPI Accessories launch - MegaBrain (Offer & Split) - 25.09 - 27.09",
      now,
    );
    expect(result.partner).toBeNull();
    expect(result.warnings).toContain("Partner could not be detected");
  });

  it.each(["Sota", "Stylus", "Стилус", "Brainstorm", "Izhakov", "Assolutely", "Mobioption"])(
    "does not match ambiguous or partial partner alias: %s",
    (suffix) => {
      const result = parsePromoSubject(`Promo iPhone 07.09-13.09 - ${suffix}`, now);
      expect(result.partner).toBeNull();
    },
  );

  it("keeps the legacy ЖЖУК alias fully supported", () => {
    expect(parsePromoSubject("Promo iPhone 07.09-13.09 - жжук", now).partner).toBe("ЖЖУК");
  });

  it("parses the primary real-world iPhone subject", () => {
    const subject =
      "UPDATE! Промо по iPhone 17 Pro, 17 Pro Max, Air, 15, 16, 16e (07.09-13.09) - Rozetka";
    expect(parsePromoSubject(subject, now)).toEqual({
      rawSubject: subject,
      partner: "Rozetka",
      lob: "iPhone",
      promoName: "Промо по iPhone 17 Pro, 17 Pro Max, Air, 15, 16, 16e",
      startDate: "2026-09-07",
      endDate: "2026-09-13",
      normalizedName: "промо по iphone 17 pro 17 pro max air 15 16 16e",
      isValid: true,
      warnings: [],
    });
  });

  it.each([
    ["Re: Промо по iPhone 17 Pro, 17 Pro Max, 16, 15, 16e (06.07-12.07) - Rozetka", "iPhone", "2026-07-06", "2026-07-12", "Промо по iPhone 17 Pro, 17 Pro Max, 16, 15, 16e"],
    ["July Promo Apple Watch SE 3 Starlight Aluminium40 mm S/M, період 10.07-26.07 - Rozetka", "AW", "2026-07-10", "2026-07-26", "July Promo Apple Watch SE 3 Starlight Aluminium40 mm S/M"],
    ["July Promo Iphone Case: Air, i6 період 10.07-02.08 - Rozetka", "ACCY", "2026-07-10", "2026-08-02", "July Promo Iphone Case: Air, i6"],
    ["August Promo AirPods Pro 3, період 10.08-23.08 - Rozetka", "AirPods", "2026-08-10", "2026-08-23", "August Promo AirPods Pro 3"],
    ["Re: UPDATE August BTS Promo Apple Pencil USB-C 10.08-28.09 - Rozetka", "ACCY", "2026-08-10", "2026-09-28", "August BTS Promo Apple Pencil USB-C"],
    ["September Promo Apple Watch SE 3 40 mm, період 07.09-20.09 - Rozetka", "AW", "2026-09-07", "2026-09-20", "September Promo Apple Watch SE 3 40 mm"],
  ])("parses required fixture %#", (subject, lob, startDate, endDate, promoName) => {
    const result = parsePromoSubject(subject, now);
    expect(result).toMatchObject({ partner: "Rozetka", lob, startDate, endDate, promoName, isValid: true });
  });

  it("removes date service words without damaging the display name", () => {
    const result = parsePromoSubject(
      "July Promo Apple Watch SE 3 Starlight Aluminium40 mm S/M, період 10.07-26.07 - Rozetka",
      now,
    );
    expect(result.promoName).toBe("July Promo Apple Watch SE 3 Starlight Aluminium40 mm S/M");
  });

  it("removes recursive prefixes", () => {
    const result = parsePromoSubject(
      "Re: RE: Fwd: UPDATE! Promo AirPods Pro 3 10.08-23.08 - Rozetka",
      now,
    );
    expect(result).toMatchObject({ lob: "AirPods", partner: "Rozetka", promoName: "Promo AirPods Pro 3" });
  });

  it("accepts identical duplicate ranges", () => {
    const result = parsePromoSubject(
      "BTS Macbook Neo 256GB, Macbook Neo 512GB 10.08 - 06.09; iPad A16 10.08 - 06.09 - Rozetka",
      now,
    );
    expect(result).toMatchObject({
      lob: "Mac iPad",
      promoName: "BTS Macbook Neo 256GB, Macbook Neo 512GB; iPad A16",
      startDate: "2026-08-10",
      endDate: "2026-09-06",
      isValid: true,
      warnings: [],
    });
  });

  it("rejects different duplicate ranges", () => {
    const result = parsePromoSubject(
      "MacBook Promo 10.08-06.09; iPad Promo 15.08-15.09 - Rozetka",
      now,
    );
    expect(result).toMatchObject({ startDate: null, endDate: null, isValid: false });
    expect(result.warnings).toContain("Multiple different promo periods detected");
  });

  it("resolves a cross-year period", () => {
    expect(parsePromoSubject("New Year Promo iPhone 28.12-10.01 - Rozetka", now)).toMatchObject({
      startDate: "2026-12-28", endDate: "2027-01-10", lob: "iPhone", isValid: true,
    });
  });

  it("rejects a resolved end date earlier than the start date", () => {
    const result = parsePromoSubject("Promo iPhone 20.09-10.09 - Rozetka", now);
    expect(result).toMatchObject({ startDate: null, endDate: null, isValid: false });
    expect(result.warnings).toContain("Invalid promo period detected");
  });

  it("does not match accessory keywords inside unrelated words", () => {
    const result = parsePromoSubject(
      "September iPhone Showcase Promo 07.09-13.09 - Rozetka",
      now,
    );
    expect(result.lob).toBe("iPhone");
  });

  it.each(["iPhone Case", "Clear Case", "Silicone Case", "Apple Pencil", "Magic Keyboard"])(
    "still detects a real accessory term: %s",
    (promoName) => {
      const result = parsePromoSubject(`${promoName} Promo 07.09-13.09 - Rozetka`, now);
      expect(result.lob).toBe("ACCY");
    },
  );

  it("does not invent an unknown partner", () => {
    const result = parsePromoSubject("Promo iPhone 17 Pro 07.09-13.09 - UnknownShop", now);
    expect(result).toMatchObject({ partner: null, lob: "iPhone", isValid: false });
    expect(result.warnings).toContain("Partner could not be detected");
  });

  it("does not invent an unknown LOB", () => {
    const result = parsePromoSubject("September Promo Some Product 07.09-13.09 - Rozetka", now);
    expect(result.lob).toBeNull();
    expect(result.warnings).toContain("LOB could not be detected");
  });

  it.each(["Promo iPhone 32.09-40.09 - Rozetka", "Promo iPhone 31.02-05.03 - Rozetka"])(
    "returns a warning for an invalid calendar period: %s",
    (subject) => {
      const result = parsePromoSubject(subject, now);
      expect(result).toMatchObject({ startDate: null, endDate: null, isValid: false });
      expect(result.warnings).toContain("Invalid promo period detected");
    },
  );

  it("canonicalizes partner casing", () => {
    expect(parsePromoSubject("Promo AirPods Pro 3 10.08-23.08 - ROZETKA", now).partner).toBe("Rozetka");
  });

  it.each(["", "   "])("handles empty input without throwing", (subject) => {
    const result = parsePromoSubject(subject, now);
    expect(result).toMatchObject({ rawSubject: subject, isValid: false, partner: null, lob: null, startDate: null, endDate: null });
    expect(new Set(result.warnings).size).toBe(result.warnings.length);
  });

  it.each([
    "Promo iPhone starts 07.09 - Rozetka",
    "Promo iPhone 07.09/13.09 - Rozetka",
  ])("warns when a complete supported range is absent: %s", (subject) => {
    const result = parsePromoSubject(subject, now);
    expect(result.warnings).toContain("Promo period could not be detected");
    expect(result.isValid).toBe(false);
  });

  it("normalizes punctuation and repeated whitespace", () => {
    const result = parsePromoSubject("  Promo:   AirPods / Pro 3!!! (10.08 - 23.08) - ROZETKA  ", now);
    expect(result.normalizedName).toBe("promo airpods pro 3");
  });

  it("preserves rawSubject exactly", () => {
    const subject = "  Re: UPDATE! Promo iPhone 07.09-13.09 - Rozetka  ";
    expect(parsePromoSubject(subject, now).rawSubject).toBe(subject);
  });
});
