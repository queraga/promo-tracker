import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardSummary, SidebarNavigation } from "../App";
import type { PromoDto, PromoStatus } from "../types";

const promo = (id: string, status: PromoStatus, partners: Array<{ id: string; name: string; received?: boolean }> = [{ id: "rozetka", name: "Rozetka" }], endDate = "2026-10-02"): PromoDto => ({ id, status, lob: "AW", name: `Promo ${id}`, startDate: "2026-10-01", endDate, prolongedAt: null, partners: partners.map((partner) => ({ promoPartnerId: `relation-${id}-${partner.id}`, partnerId: partner.id, partnerName: partner.name, reportReceived: partner.received ?? false, reportReceivedAt: null, rawEmailSubject: `Promo ${id}` })) });
const navigation = (role: "KAM" | "PLM" | "SUPERUSER", pending = 2) => renderToStaticMarkup(<SidebarNavigation role={role} page="tracker" pendingOnly={false} pending={pending} onOverview={vi.fn()} onPending={vi.fn()} onUsers={vi.fn()} onQuarterly={vi.fn()} onArchive={vi.fn()} />);

describe("dashboard summary and navigation", () => {
  it("shows total, active, and pending counters in order", () => {
    const html = renderToStaticMarkup(<DashboardSummary promos={[promo("1", "active"), promo("2", "planned"), promo("3", "finished")]} selectedPartnerIds={null} />);
    expect(html).toMatch(/Всього промо<\/span><strong>3.*Активні<\/span><strong>1.*Очікуються звіти<\/span><strong>1/);
    expect(html).not.toContain("Заплановані");
    expect((html.match(/<div>/g) ?? [])).toHaveLength(3);
  });
  it("recalculates counters from quarter/LOB/partner-filtered workspace rows", () => {
    const q4SelectedRows = [promo("1", "active", [{ id: "comfy", name: "Comfy" }]), promo("2", "finished", [{ id: "rozetka", name: "Rozetka" }, { id: "citrus", name: "Citrus" }])];
    const html = renderToStaticMarkup(<DashboardSummary promos={q4SelectedRows} selectedPartnerIds={["comfy", "rozetka"]} />);
    expect(html).toMatch(/Всього промо<\/span><strong>2.*Активні<\/span><strong>1.*Очікуються звіти<\/span><strong>1/);
  });
  it("counts pending only for selected relations and does not count hidden Citrus", () => {
    const rows = [promo("1", "finished", [{ id: "comfy", name: "Comfy" }, { id: "citrus", name: "Citrus" }])];
    const selected = renderToStaticMarkup(<DashboardSummary promos={rows} selectedPartnerIds={["comfy"]} />);
    const all = renderToStaticMarkup(<DashboardSummary promos={rows} selectedPartnerIds={null} />);
    expect(selected).toContain("Очікуються звіти</span><strong>1");
    expect(all).toContain("Очікуються звіти</span><strong>2");
  });
  it("keeps the pending badge global and independent of dashboard filters", () => {
    expect(navigation("SUPERUSER", 7)).toContain("Очікуються звіти <em>7</em>");
  });
  it("retains expected role-specific tracker navigation", () => {
    const superuser = navigation("SUPERUSER");
    expect(superuser).toContain("Огляд");
    expect(superuser).toContain("Очікуються звіти");
    expect(superuser).toContain("Користувачі");
    expect(superuser).toContain("Архів");
    expect(superuser).not.toContain("Усі промо");
    expect(superuser).not.toContain(">Партнери<");
    expect(navigation("KAM")).not.toContain("Користувачі");
    expect(navigation("KAM")).not.toContain("Квартальна звітність");
    expect(navigation("KAM")).not.toContain("Архів");
    expect(navigation("PLM")).toContain("Квартальна звітність");
    expect(navigation("PLM")).not.toContain("Користувачі");
  });
});
