import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getPartnerFeed, MobilePartnerFeed } from "./MobilePartnerFeed";
import type { PromoDto, PromoStatus } from "../types";

const promo = (id: string, partnerName: string, status: PromoStatus, reportReceived = false): PromoDto => ({
  id, lob: "iPhone", name: `Promo ${id}`, startDate: "2026-09-01", endDate: "2026-09-10", status,
  partners: [{ promoPartnerId: `relation-${id}`, partnerId: `partner-${partnerName}`, partnerName, reportReceived, reportReceivedAt: reportReceived ? "2026-09-11" : null, rawEmailSubject: `Promo ${id}` }],
});
const promos = [promo("active", "Rozetka", "active"), promo("pending", "Rozetka", "finished"), promo("received", "Rozetka", "finished", true), promo("other", "Comfy", "finished")];

describe("mobile partner feed", () => {
  it("asks for a partner before showing promos", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={["Rozetka", "Comfy"]} selectedPartner="" pendingOnly={false} onPartnerChange={vi.fn()} onSelect={vi.fn()} />);
    expect(html).toContain("Оберіть партнера");
    expect(html).not.toContain("Promo active");
  });
  it("shows only the selected partner with status and report state", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={["Rozetka", "Comfy"]} selectedPartner="Rozetka" pendingOnly={false} onPartnerChange={vi.fn()} onSelect={vi.fn()} />);
    expect(html).toContain("Promo active");
    expect(html).toContain("Promo pending");
    expect(html).toContain("Очікується звіт");
    expect(html).toContain("Звіт отримано");
    expect(html).not.toContain("Promo other");
  });
  it("applies pending reports to the selected partner relation", () => {
    expect(getPartnerFeed(promos, "Rozetka", true).map((item) => item.id)).toEqual(["pending"]);
    expect(getPartnerFeed(promos, "Comfy", true).map((item) => item.id)).toEqual(["other"]);
  });
  it("renders a selector that allows changing partner without logout", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={["Rozetka", "Comfy"]} selectedPartner="Rozetka" pendingOnly={false} onPartnerChange={vi.fn()} onSelect={vi.fn()} />);
    expect(html).toContain("<select");
    expect(html).toContain("Comfy");
  });
});
