import { describe, expect, it } from "vitest";
import { quarterForEndDate } from "../src/features/quarterlyReporting/quarter.js";

describe("reporting quarter calculation", () => {
  it.each([
    ["2026-07-20", { year: 2026, quarter: 3 }],
    ["2026-09-30", { year: 2026, quarter: 3 }],
    ["2026-10-01", { year: 2026, quarter: 4 }],
    ["2026-10-05", { year: 2026, quarter: 4 }],
    ["2026-12-31", { year: 2026, quarter: 4 }],
    ["2027-01-01", { year: 2027, quarter: 1 }],
  ] as const)("maps %s from Promo.endDate", (date, expected) => expect(quarterForEndDate(date)).toEqual(expected));

  it("uses UTC calendar components for stored business dates", () => {
    expect(quarterForEndDate(new Date("2026-10-01T00:00:00.000Z"))).toEqual({ year: 2026, quarter: 4 });
    expect(quarterForEndDate("2026-09-30T23:00:00-02:00")).toEqual({ year: 2026, quarter: 3 });
  });
});
