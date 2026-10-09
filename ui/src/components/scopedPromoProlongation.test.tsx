import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeScopedProlongation, scopedProlongationSuccessMessage } from "../App";
import { ApiError, prolongAssignedPromoPartners } from "../shared/api/client";
import type { CurrentUser, PromoDto } from "../types";
import { PromoDrawer, scopedPartnerSelection, toggleAllScopedPartners } from "./PromoDrawer";
import { getProlongationPreview, isKamProlongationEligible, ScopedProlongationDialog, scopedProlongationErrorMessage } from "./PromoProlongation";

const activePromo = (overrides: Partial<PromoDto> = {}): PromoDto => ({
  id: "promo-1", lob: "iPhone", name: "September Promo", startDate: "2026-09-03T00:00:00.000Z", endDate: "2026-09-28T00:00:00.000Z", prolongedAt: null, status: "active",
  partners: [
    { promoPartnerId: "rel-rozetka", partnerId: "rozetka", partnerName: "Rozetka", reportReceived: false, reportReceivedAt: null, rawEmailSubject: null },
    { promoPartnerId: "rel-comfy", partnerId: "comfy", partnerName: "Comfy", reportReceived: false, reportReceivedAt: null, rawEmailSubject: null },
  ], ...overrides,
});
const user = (role: CurrentUser["role"]): CurrentUser => ({ id: 1, email: `${role.toLowerCase()}@example.com`, role });
const drawer = (role: CurrentUser["role"], promo = activePromo()) => renderToStaticMarkup(<PromoDrawer promo={promo} user={user(role)} busyId={null} onClose={vi.fn()} onToggle={vi.fn()} onDeletePromo={vi.fn()} onRemovePartner={vi.fn()} onExpanded={vi.fn()} onProlonged={vi.fn()} onScopedProlonged={vi.fn()} onError={vi.fn()} />);
const scopedDialog = (selected: string[], endDate = "2026-10-12", submitting = false, error = "") => renderToStaticMarkup(<ScopedProlongationDialog promo={activePromo()} endDate={endDate} submitting={submitting} error={error} selectedPromoPartnerIds={selected} onEndDateChange={vi.fn()} onTogglePartner={vi.fn()} onToggleAll={vi.fn()} onCancel={vi.fn()} onConfirm={vi.fn()} />);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("M11.3b KAM scoped prolongation UI", () => {
  it("shows the scoped action to eligible KAM, keeps SUPERUSER action, and keeps PLM read-only", () => {
    expect(drawer("KAM")).toContain("Пролонгація");
    expect(drawer("SUPERUSER")).toContain("Адміністрування");
    expect(drawer("PLM")).not.toContain("Пролонгація");
  });

  it("does not offer KAM prolongation for an ended Promo", () => expect(drawer("KAM", activePromo({ status: "finished" }))).not.toContain("Пролонгація"));

  it("uses only scoped promoPartnerIds and selects every visible relation by default", () => {
    expect(scopedPartnerSelection(activePromo())).toEqual(["rel-rozetka", "rel-comfy"]);
    expect(toggleAllScopedPartners(activePromo(), ["rel-rozetka"])).toEqual(["rel-rozetka", "rel-comfy"]);
    expect(toggleAllScopedPartners(activePromo(), ["rel-rozetka", "rel-comfy"])).toEqual([]);
  });

  it("renders human-readable own partners and complete confirmation context", () => {
    const html = scopedDialog(["rel-rozetka", "rel-comfy"]);
    expect(html).toContain("Партнери промо"); expect(html).not.toContain("Усі партнери"); expect(html).toContain("Обрано: Rozetka, Comfy");
    expect(html).toContain("Rozetka"); expect(html).toContain("Comfy"); expect(html).toContain("September Promo");
    expect(html).toContain("03.09.2026"); expect(html).toContain("28.09.2026"); expect(html).toContain("12.10.2026");
  });

  it("disables confirmation with zero selection without rendering an error", () => {
    const html = scopedDialog([], "2026-09-30");
    expect(html).toContain('disabled=""'); expect(html).not.toContain('role="alert"'); expect(html).toContain("Обрати всі");
  });

  it("shows a clear-all control when every visible relation is selected", () => expect(scopedDialog(["rel-rozetka", "rel-comfy"])).toContain("Зняти вибір"));

  it("previews same-quarter, adjacent-quarter and Q4-to-Q1 periods but rejects farther quarters", () => {
    expect(getProlongationPreview(activePromo(), "2026-09-30")?.kind).toBe("extended");
    expect(getProlongationPreview(activePromo(), "2026-10-12")?.kind).toBe("split");
    const yearBoundary = getProlongationPreview(activePromo({ startDate: "2026-12-01", endDate: "2026-12-28" }), "2027-01-12");
    expect(yearBoundary).toMatchObject({ kind: "split", currentQuarter: 4, currentYear: 2026, nextQuarter: 1, nextYear: 2027 });
    expect(getProlongationPreview(activePromo(), "2027-01-12")).toBeNull();
  });

  it("uses UTC calendar eligibility and keeps the final source day eligible", () => {
    expect(isKamProlongationEligible(activePromo(), new Date("2026-09-28T23:59:59Z"))).toBe(true);
    expect(isKamProlongationEligible(activePromo(), new Date("2026-09-29T00:00:00Z"))).toBe(false);
  });

  it("posts selected promoPartner relation IDs with partner IDs for server-side verification", async () => {
    const result = { kind: "split" as const, refreshRequired: true as const };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result }); vi.stubGlobal("fetch", fetch);
    await expect(prolongAssignedPromoPartners("promo-1", [{ promoPartnerId: "rel-comfy", partnerId: "comfy" }], "2026-10-12")).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith("/api/promos/promo-1/prolong-partners", expect.objectContaining({ method: "POST", body: JSON.stringify({ promoPartnerSelections: [{ promoPartnerId: "rel-comfy", partnerId: "comfy" }], endDate: "2026-10-12" }) }));
  });

  it("closes and reloads the scoped workspace instead of patching mutation data", async () => {
    const load = vi.fn().mockResolvedValue(undefined); const close = vi.fn(); const notice = vi.fn(); const kam = user("KAM");
    await completeScopedProlongation({ kind: "extended", refreshRequired: true }, kam, load, close, notice);
    expect(close).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledWith(kam); expect(notice).toHaveBeenCalledWith("Промо успішно продовжено.");
    expect(scopedProlongationSuccessMessage({ kind: "split", refreshRequired: true })).toContain("розділено за кварталами");
  });

  it.each([[400, "Перевірте"], [403, "немає доступу"], [404, "більше недоступне"], [409, "Оновіть робочий простір"]])("maps scoped backend %s to safe Ukrainian UX", (status, message) => expect(scopedProlongationErrorMessage(new ApiError(status as number, "hidden internals"))).toContain(message));
  it("shows the specific closed-period message returned by the API", () => expect(scopedProlongationErrorMessage(new ApiError(409, "Звітний період уже закрито. Пролонгація недоступна."))).toContain("період уже закрито"));

  it("locks partner/date/actions while a scoped request is pending", () => {
    const html = scopedDialog(["rel-rozetka"], "2026-09-30", true);
    expect(html).toContain("Збереження…"); expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
