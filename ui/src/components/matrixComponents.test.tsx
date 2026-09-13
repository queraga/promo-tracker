import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PartnerColumnSelector } from "./PartnerColumnSelector";
import { TrackerTable } from "./TrackerTable";
import type { PromoDto } from "../types";

const promo: PromoDto = { id: "promo-1", lob: "AW", name: "Watch Promo", startDate: "2026-09-01", endDate: "2026-09-02", status: "finished", partners: [{ promoPartnerId: "relation-1", partnerId: "partner-1", partnerName: "Rozetka", reportReceived: false, reportReceivedAt: null, rawEmailSubject: "Watch Promo" }] };

describe("desktop matrix components", () => {
  it("marks all four context columns as sticky", () => {
    const html = renderToStaticMarkup(<TrackerTable promos={[promo]} partners={["Rozetka"]} onSelect={vi.fn()} />);
    expect(html).toContain('class="sticky lob"');
    expect(html).toContain('class="sticky promo"');
    expect(html).toContain('class="sticky period"');
    expect(html).toContain('class="sticky status-column"');
  });
  it("shows all and selected counts independently of the partner filter", () => {
    expect(renderToStaticMarkup(<PartnerColumnSelector partners={["Rozetka", "Comfy"]} selected={null} onChange={vi.fn()} />)).toContain("Усі партнери");
    expect(renderToStaticMarkup(<PartnerColumnSelector partners={["Rozetka", "Comfy"]} selected={["Comfy"]} onChange={vi.fn()} />)).toContain("Обрано 1");
  });
});
