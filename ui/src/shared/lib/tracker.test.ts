import { describe, expect, it } from "vitest";
import type { Filters, PromoDto } from "../../types";
import { countPendingReports, createDefaultFilters, filterPromos, getCurrentQuarter, getPartnerCellState, getPartnerColumns, getVisiblePartnerOptions, getWorkspaceEmptyMessage, getWorkspacePartnerOptions, getWorkspaceQuarterOptions, hasPendingReport, reconcileQuarterSelection, sortPromos } from "./tracker";

const relation = (partnerId: string, partnerName: string, reportReceived = false) => ({ promoPartnerId: `${partnerId}-relation`, partnerId, partnerName, reportReceived, reportReceivedAt: null, rawEmailSubject: null });
const promo = (id: string, status: PromoDto["status"], lob: string, name: string, partners: ReturnType<typeof relation>[], endDate = "2026-09-13T00:00:00.000Z"): PromoDto => ({ id, status, lob, name, startDate: "2026-09-01T00:00:00.000Z", endDate, prolongedAt: null, partners });
const promos = [
  promo("1", "finished", "AW", "Watch campaign", [relation("r", "Rozetka"), relation("c", "Comfy")]),
  promo("2", "planned", "Mac iPad", "Back to School", [relation("m", "MOYO")]),
  promo("3", "active", "iPhone", "September Phone", [relation("f", "Foxtrot")]),
  promo("4", "finished", "iPhone", "October phone", [relation("r", "Rozetka"), relation("c", "Comfy"), relation("x", "Citrus")], "2026-10-05T00:00:00.000Z"),
];
const filters = (partial: Partial<Filters> = {}): Filters => ({ search: "", lob: "", status: "", quarter: null, partners: null, ...partial });

describe("workspace filters", () => {
  it("defaults to the current calendar quarter and offers it even without promos", () => {
    const current = getCurrentQuarter(new Date("2026-10-06T12:00:00Z"));
    expect(current).toEqual({ year: 2026, quarter: 4 });
    expect(createDefaultFilters(new Date("2026-10-06T12:00:00Z")).quarter).toEqual(current);
    expect(getWorkspaceQuarterOptions([], current)).toEqual([current]);
  });
  it("derives promo quarter from endDate, including cross-quarter promos", () => {
    expect(getWorkspaceQuarterOptions(promos, { year: 2026, quarter: 4 })).toEqual([{ year: 2026, quarter: 4 }, { year: 2026, quarter: 3 }]);
    expect(filterPromos(promos, filters({ quarter: { year: 2026, quarter: 4 } })).map(({ id }) => id)).toEqual(["4"]);
    expect(filterPromos(promos, filters({ quarter: { year: 2026, quarter: 3 } })).map(({ id }) => id)).toEqual(["1", "2", "3"]);
  });
  it("handles year rollover and All quarters", () => {
    expect(getWorkspaceQuarterOptions([promo("5", "active", "Mac", "New Year", [], "2027-01-03"), promo("6", "finished", "AW", "Q4", [], "2026-12-28")], { year: 2027, quarter: 1 })).toEqual([{ year: 2027, quarter: 1 }, { year: 2026, quarter: 4 }]);
    expect(filterPromos(promos, filters({ quarter: null })).map(({ id }) => id)).toHaveLength(4);
  });
  it("falls back to current quarter when a selected quarter disappears", () => {
    expect(reconcileQuarterSelection({ year: 2026, quarter: 3 }, [{ year: 2026, quarter: 4 }], { year: 2026, quarter: 4 })).toEqual({ year: 2026, quarter: 4 });
    expect(reconcileQuarterSelection(null, [{ year: 2026, quarter: 4 }], { year: 2026, quarter: 4 })).toBeNull();
  });
  it("keeps closed data out when the authorized workspace dataset excludes it", () => {
    expect(getWorkspaceQuarterOptions([promos[0]!], { year: 2026, quarter: 4 })).toEqual([{ year: 2026, quarter: 4 }, { year: 2026, quarter: 3 }]);
  });
  it("combines quarter, LOB, status, partner OR, and search filters", () => {
    expect(filterPromos(promos, filters({ quarter: { year: 2026, quarter: 4 }, lob: "iPhone", status: "finished", partners: ["r", "c"], search: "citrus" })).map(({ id }) => id)).toEqual(["4"]);
    expect(filterPromos(promos, filters({ partners: ["r", "c"] })).map(({ id }) => id)).toEqual(["1", "4"]);
    expect(filterPromos(promos, filters({ partners: ["r"] })).map(({ id }) => id)).toEqual(["1", "4"]);
    expect(filterPromos(promos, filters({ partners: [] }))).toEqual([]);
    expect(filterPromos(promos, filters({ search: "foxtrot" })).map(({ id }) => id)).toEqual(["3"]);
  });
});

describe("unified partner selection and counters", () => {
  it("builds selector options only from authorized partner names and scoped associations", () => {
    expect(getWorkspacePartnerOptions([promos[0]!], ["Rozetka", "Comfy", "Assigned KAM partner"])).toEqual([{ id: "r", name: "Rozetka" }, { id: "c", name: "Comfy" }, { id: "unassociated:Assigned KAM partner", name: "Assigned KAM partner" }]);
  });
  it("uses selected partners for columns; all and empty retain their meanings", () => {
    const available = getWorkspacePartnerOptions(promos, ["Rozetka", "Comfy", "Citrus"]);
    expect(getPartnerColumns(promos)).toEqual(["Citrus", "Comfy", "Foxtrot", "MOYO", "Rozetka"]);
    expect(getVisiblePartnerOptions(available, ["r", "c"]).map(({ name }) => name)).toEqual(["Rozetka", "Comfy"]);
    expect(getVisiblePartnerOptions(available, null)).toEqual(available);
    expect(getVisiblePartnerOptions(available, [])).toEqual([]);
  });
  it("counts pending reports only for selected partner relations, without double counting promos", () => {
    expect(filterPromos(promos, filters({ partners: ["r", "c"] }))).toHaveLength(2);
    expect(countPendingReports(promos.filter(({ id }) => ["1", "4"].includes(id)), ["r", "c"])).toBe(4);
    expect(countPendingReports([promos[3]!], ["r", "c"])).toBe(2);
    expect(countPendingReports([promos[3]!], ["c"])).toBe(1);
    expect(hasPendingReport(promos[3]!, ["c"])).toBe(true);
    expect(hasPendingReport(promos[3]!, ["x"])).toBe(true);
    expect(countPendingReports([promos[3]!], [])).toBe(0);
  });
  it("keeps empty current-quarter workspaces useful", () => {
    expect(getWorkspaceEmptyMessage(promos, filters({ quarter: { year: 2026, quarter: 2 } }), false)).toContain("немає відкритих промо");
    expect(getWorkspaceEmptyMessage(promos, filters({ partners: [] }), false)).toContain("Партнерів не обрано");
  });
});

describe("existing report and ordering behavior", () => {
  it("renders report cell states consistently", () => {
    expect(getPartnerCellState("finished", promos[0]!.partners[0])).toBe("pending");
    expect(getPartnerCellState("finished", { ...promos[0]!.partners[0]!, reportReceived: true })).toBe("received");
    expect(getPartnerCellState("active", promos[0]!.partners[0])).toBe("participating");
    expect(getPartnerCellState("planned", promos[0]!.partners[0])).toBe("participating");
  });
  it("sorts active, planned, finished", () => expect(sortPromos(promos.slice(0, 3)).map((item) => item.status)).toEqual(["active", "planned", "finished"]));
});
