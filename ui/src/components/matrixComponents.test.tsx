import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PartnerColumnSelector } from "./PartnerColumnSelector";
import { TrackerTable } from "./TrackerTable";
import { TrackerToolbar } from "./TrackerToolbar";
import type { PromoDto } from "../types";

const promo: PromoDto = { id: "promo-1", lob: "AW", name: "Watch Promo", startDate: "2026-09-01", endDate: "2026-09-02", status: "finished", prolongedAt: null, partners: [{ promoPartnerId: "relation-1", partnerId: "partner-1", partnerName: "Rozetka", reportReceived: false, reportReceivedAt: null, rawEmailSubject: "Watch Promo" }] };
const options = [{ id: "partner-Rozetka", name: "Rozetka" }, { id: "partner-Comfy", name: "Comfy" }];

describe("desktop matrix components", () => {
  it("renders the unified toolbar controls without a separate Partner filter", () => {
    const filters = { search: "", lob: "", status: "", quarter: { year: 2026, quarter: 4 }, partners: null };
    const html = renderToStaticMarkup(<TrackerToolbar filters={filters} setFilters={vi.fn()} lobs={["AW"]} quarters={[{ year: 2026, quarter: 4 }]} partners={options} onPartnersChange={vi.fn()} onReset={vi.fn()} />);
    expect(html).toContain("Пошук");
    expect(html).toContain("Квартал");
    expect(html).toContain("Партнери");
    expect(html).toContain("Скинути фільтри");
    expect(html).not.toContain("Колонки партнерів");
    expect(html).not.toContain("Партнер</span>");
  });
  it("marks all four context columns as sticky", () => {
    const html = renderToStaticMarkup(<TrackerTable promos={[promo]} partners={[{ id: "partner-1", name: "Rozetka" }]} onSelect={vi.fn()} />);
    expect(html).toContain('class="sticky lob"');
    expect(html).toContain('class="sticky promo"');
    expect(html).toContain('class="sticky period"');
    expect(html).toContain('class="sticky status-column"');
  });
  it("shows all and selected counts in the unified Partners selector", () => {
    const all = renderToStaticMarkup(<PartnerColumnSelector partners={options} selected={null} onChange={vi.fn()} />);
    expect(all).toContain("Усі партнери");
    expect(all).toContain("Партнери");
    expect(all).toContain("Обрати всіх");
    expect(all).toContain("Очистити");
    expect(renderToStaticMarkup(<PartnerColumnSelector partners={options} selected={["partner-Comfy"]} onChange={vi.fn()} />)).toContain("Обрано 1");
    expect(renderToStaticMarkup(<PartnerColumnSelector partners={options} selected={[]} onChange={vi.fn()} />)).toContain("Обрано 0");
    expect(renderToStaticMarkup(<PartnerColumnSelector partners={[options[0]!]} selected={["partner-Rozetka", "removed-id"]} onChange={vi.fn()} />)).toContain("Обрано 1");
  });
  it("keeps a valid context-only table with zero partner columns", () => {
    const html = renderToStaticMarkup(<TrackerTable promos={[promo]} partners={[]} onSelect={vi.fn()} />);
    expect(html).toContain("LOB");
    expect(html).toContain("Промо");
    expect(html).toContain("Період");
    expect(html).toContain("Статус");
    expect(html).not.toContain("Rozetka");
  });
  it.each([
    [{ kind: "FSM" }, "FSM"],
    [{ kind: "CREDIT", bank: "MONO", mechanic: "ПЧ10" }, "mono · ПЧ10"],
    [{ kind: "CREDIT", bank: "MONO", mechanic: null }, "mono"],
    [{ kind: "CREDIT", bank: "PRIVATBANK", mechanic: "ОЧ25" }, "ПриватБанк · ОЧ25"],
  ] as const)("renders special badge %s and keeps Prolonged independent", (specialPromo, label) => {
    const html = renderToStaticMarkup(<TrackerTable promos={[{ ...promo, specialPromo, prolongedAt: "2026-09-29T10:00:00.000Z" }]} partners={[]} onSelect={vi.fn()} />);
    expect(html).toContain(`class="special-promo-badge">${label}</span>`);
    expect(html).toContain("class=\"prolonged-badge\">Prolonged</span>");
    expect(html).toContain("promo-name-with-metadata");
  });
  it("renders no special badge for standard desktop promos", () => {
    const html = renderToStaticMarkup(<TrackerTable promos={[promo]} partners={[]} onSelect={vi.fn()} />);
    expect(html).not.toContain("special-promo-badge");
  });
});
