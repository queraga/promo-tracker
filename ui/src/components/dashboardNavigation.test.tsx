import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardSummary, SidebarNavigation } from "../App";
import type { PromoDto, PromoStatus } from "../types";

const promo = (id: string, status: PromoStatus, partnerName = "Rozetka", reportReceived = false): PromoDto => ({ id, status, lob: "AW", name: `Promo ${id}`, startDate: "2026-09-01", endDate: "2026-09-02", partners: [{ promoPartnerId: `relation-${id}-${partnerName}`, partnerId: `partner-${partnerName}`, partnerName, reportReceived, reportReceivedAt: null, rawEmailSubject: `Promo ${id}` }] });
const navigation = (role: "KAM" | "PLM" | "SUPERUSER") => renderToStaticMarkup(<SidebarNavigation role={role} page="tracker" pendingOnly={false} pending={2} onOverview={vi.fn()} onPending={vi.fn()} onUsers={vi.fn()} />);

describe("dashboard summary and navigation", () => {
  it("shows total promos, active promos and pending reports in order", () => {
    const html = renderToStaticMarkup(<DashboardSummary promos={[promo("1", "active"), promo("2", "planned"), promo("3", "finished")]} partner="" />);
    expect(html).toMatch(/Всього промо<\/span><strong>3.*Активні<\/span><strong>1.*Очікуються звіти<\/span><strong>1/);
    expect(html).not.toContain("Заплановані");
    expect((html.match(/<div>/g) ?? [])).toHaveLength(3);
  });

  it("recalculates counters for a filtered promo set and selected partner", () => {
    const filtered = [promo("1", "active"), promo("2", "finished"), promo("3", "finished", "MOYO"), promo("4", "finished", "Rozetka", true)];
    const html = renderToStaticMarkup(<DashboardSummary promos={filtered} partner="Rozetka" />);
    expect(html).toMatch(/Всього промо<\/span><strong>4.*Активні<\/span><strong>1.*Очікуються звіти<\/span><strong>1/);
  });

  it("keeps only the approved tracker navigation items for SUPERUSER", () => {
    const html = navigation("SUPERUSER");
    expect(html).toContain("Огляд");
    expect(html).toContain("Очікуються звіти");
    expect(html).toContain("Користувачі");
    expect(html).not.toContain("Усі промо");
    expect(html).not.toContain(">Партнери<");
  });

  it("keeps user administration hidden from KAM", () => {
    expect(navigation("KAM")).not.toContain("Користувачі");
  });

  it("shows the normal tracker navigation but no Users administration for PLM", () => {
    const html = navigation("PLM");
    expect(html).toContain("Огляд");
    expect(html).toContain("Очікуються звіти");
    expect(html).not.toContain("Користувачі");
  });
});
