import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { replaceWorkspacePromo } from "../App";
import type { CurrentUser, PromoDto, PromoPartnerOption } from "../types";
import { availablePartnerOptions, PartnerExpansionDialog, PromoDrawer, selectAllAvailablePartners, togglePartnerSelection } from "./PromoDrawer";

const options: PromoPartnerOption[] = [
  { id: "kibernetiki", name: "Kibernetiki", alreadyAssociated: true },
  { id: "ispace", name: "iSpace", alreadyAssociated: false },
  { id: "ktc", name: "KTC", alreadyAssociated: false },
];
const promo: PromoDto = { id: "promo-1", lob: "ACCY", name: "Neutral promo", startDate: "2026-09-01", endDate: "2026-09-02", status: "finished", partners: [
  { promoPartnerId: "r1", partnerId: "kibernetiki", partnerName: "Kibernetiki", reportReceived: false, reportReceivedAt: null, rawEmailSubject: "Real Kibernetiki subject" },
  { promoPartnerId: "r2", partnerId: "ispace", partnerName: "iSpace", reportReceived: false, reportReceivedAt: null, rawEmailSubject: null },
] };
const user: CurrentUser = { id: 2, email: "kam@example.com", role: "KAM" };
const dialog = (overrides: Partial<ComponentProps<typeof PartnerExpansionDialog>> = {}) => renderToStaticMarkup(<PartnerExpansionDialog options={options} selected={[]} loading={false} submitting={false} onToggle={vi.fn()} onSelectAll={vi.fn()} onCancel={vi.fn()} onAdd={vi.fn()} {...overrides} />);

describe("promo partner expansion UI", () => {
  it("renders the drawer action for KAM and keeps real/manual subject ownership distinct", () => {
    const html = renderToStaticMarkup(<PromoDrawer promo={promo} user={user} busyId={null} onClose={vi.fn()} onToggle={vi.fn()} onDeletePromo={vi.fn()} onRemovePartner={vi.fn()} onExpanded={vi.fn()} onError={vi.fn()} />);
    expect(html).toContain("Додати партнерів");
    expect(html).toContain("Real Kibernetiki subject");
    expect(html).toContain("Додано вручну");
    expect((html.match(/Вхідний текст/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain("Тема листа");
  });
  it("shows already-added partners disabled and assigned available partners selectable", () => {
    const html = dialog();
    expect(html).toContain("Додати промо партнерам");
    expect(html).toContain("вже додано");
    expect(html).toContain('disabled="" checked=""');
    expect(html).toContain("iSpace");
    expect(html).toContain("KTC");
    expect(html).not.toContain("Rozetka");
  });
  it("selects one, multiple, and all available partners without including existing relations", () => {
    expect(togglePartnerSelection([], "ispace")).toEqual(["ispace"]);
    expect(togglePartnerSelection(["ispace"], "ktc")).toEqual(["ispace", "ktc"]);
    expect(selectAllAvailablePartners(options)).toEqual(["ispace", "ktc"]);
    expect(availablePartnerOptions(options).map(({ id }) => id)).toEqual(["ispace", "ktc"]);
  });
  it("keeps Add disabled until a selection exists and exposes Cancel", () => {
    expect(dialog()).toContain("disabled=\"\"");
    const html = dialog({ selected: ["ispace"] });
    expect(html).toContain("Скасувати");
    expect(html).toContain("Обрати всіх доступних");
  });
  it("shows a clear state when no partners remain", () => expect(dialog({ options: [options[0]] })).toContain("Усі доступні партнери вже додані до промо."));
  it("replaces the expanded promo in workspace state without reloading unrelated rows", () => {
    const other = { ...promo, id: "promo-2", name: "Other" };
    const updated = { ...promo, partners: [...promo.partners, { promoPartnerId: "r3", partnerId: "ktc", partnerName: "KTC", reportReceived: false, reportReceivedAt: null, rawEmailSubject: null }] };
    expect(replaceWorkspacePromo([promo, other], updated)).toEqual([updated, other]);
  });
});
