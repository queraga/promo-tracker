import { describe, expect, it } from "vitest";
import { getPromoStatus } from "../src/entities/promo/getPromoStatus.js";
import { parsePromoDate } from "../src/shared/date/parsePromoDate.js";
import { toUtcCalendarDate } from "../src/shared/date/toUtcCalendarDate.js";

describe("getPromoStatus", () => {
  const startDate = parsePromoDate("2026-09-07");
  const endDate = parsePromoDate("2026-09-13");

  it("returns planned before the promo starts", () => {
    expect(getPromoStatus(startDate, endDate, parsePromoDate("2026-09-06"))).toBe("planned");
  });

  it("returns active inside the promo period", () => {
    expect(getPromoStatus(startDate, endDate, parsePromoDate("2026-09-10"))).toBe("active");
  });

  it("returns active at midday on the end date", () => {
    expect(getPromoStatus(startDate, endDate, new Date("2026-09-13T12:00:00.000Z"))).toBe(
      "active",
    );
  });

  it("returns active at 23:59 on the end date", () => {
    expect(getPromoStatus(startDate, endDate, new Date("2026-09-13T23:59:59.999Z"))).toBe(
      "active",
    );
  });

  it("returns finished on the next calendar day", () => {
    expect(getPromoStatus(startDate, endDate, new Date("2026-09-14T12:00:00.000Z"))).toBe(
      "finished",
    );
  });

  it("converts parser dates to UTC midnight", () => {
    expect(parsePromoDate("2026-09-07").toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });

  it("normalizes any timestamp to its UTC calendar date", () => {
    expect(toUtcCalendarDate(new Date("2026-09-13T18:42:00.000Z")).toISOString()).toBe(
      "2026-09-13T00:00:00.000Z",
    );
  });
});
