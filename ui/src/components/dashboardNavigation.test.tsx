import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardSummary, SidebarNavigation } from "../App";
import type { PromoDto, PromoStatus } from "../types";

const promo = (id: string, status: PromoStatus): PromoDto => ({ id, status, lob: "AW", name: `Promo ${id}`, startDate: "2026-09-01", endDate: "2026-09-02", partners: [] });
const navigation = (role: "USER" | "SUPERUSER") => renderToStaticMarkup(<SidebarNavigation role={role} page="tracker" pendingOnly={false} pending={2} onOverview={vi.fn()} onPending={vi.fn()} onUsers={vi.fn()} />);

describe("dashboard summary and navigation", () => {
  it("shows total promos, active promos and pending reports in order", () => {
    const html = renderToStaticMarkup(<DashboardSummary promos={[promo("1", "active"), promo("2", "planned"), promo("3", "finished")]} pending={2} />);
    expect(html).toMatch(/Всього промо<\/span><strong>3.*Активні<\/span><strong>1.*Очікуються звіти<\/span><strong>2/);
    expect(html).not.toContain("Заплановані");
    expect((html.match(/<div>/g) ?? [])).toHaveLength(3);
  });

  it("keeps only the approved tracker navigation items for SUPERUSER", () => {
    const html = navigation("SUPERUSER");
    expect(html).toContain("Огляд");
    expect(html).toContain("Очікуються звіти");
    expect(html).toContain("Користувачі");
    expect(html).not.toContain("Усі промо");
    expect(html).not.toContain(">Партнери<");
  });

  it("keeps user administration hidden from USER", () => {
    expect(navigation("USER")).not.toContain("Користувачі");
  });
});
