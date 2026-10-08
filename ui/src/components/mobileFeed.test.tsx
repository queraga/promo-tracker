import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getPartnerFeed, MobilePartnerFeed } from "./MobilePartnerFeed";
import type { PartnerOption, PromoDto, PromoStatus } from "../types";

const promo = (id: string, partners: Array<{ name: string; received?: boolean }>, status: PromoStatus = "finished"): PromoDto => ({
  id, lob: "iPhone", name: `Promo ${id}`, startDate: "2026-09-01", endDate: "2026-09-10", prolongedAt: null, status,
  partners: partners.map(({ name, received }) => ({ promoPartnerId: `relation-${id}-${name}`, partnerId: `partner-${name}`, partnerName: name, reportReceived: Boolean(received), reportReceivedAt: received ? "2026-09-11" : null, rawEmailSubject: `Promo ${id}` })),
});
const partners: PartnerOption[] = ["Comfy", "Rozetka", "Citrus"].map((name) => ({ id: `partner-${name}`, name }));
const promos = [
  promo("a", [{ name: "Comfy" }, { name: "Rozetka" }]),
  promo("b", [{ name: "Rozetka" }, { name: "Citrus" }]),
  promo("c", [{ name: "Citrus" }]),
  promo("d", [{ name: "Comfy" }, { name: "Citrus" }]),
  promo("active", [{ name: "Comfy" }], "active"),
];

describe("mobile partner feed", () => {
  it("uses OR semantics and shows each selected Promo once", () => {
    const selected = ["partner-Comfy", "partner-Rozetka"];
    expect(getPartnerFeed(promos, selected, false).map((item) => item.id)).toEqual(["active", "a", "b", "d"]);
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={partners} selectedPartners={selected} pendingOnly={false} onSelect={() => undefined} />);
    expect((html.match(/class="promo-card"/g) ?? [])).toHaveLength(4);
    expect(html).toContain("Comfy");
    expect(html).toContain("Rozetka");
    expect(html).not.toContain("<strong>Citrus:");
    expect(html).not.toContain("Promo c");
  });
  it("shows only pending states for selected relations in pending mode", () => {
    const records = [promo("selected-pending", [{ name: "Comfy" }]), promo("hidden-pending", [{ name: "Comfy", received: true }, { name: "Citrus" }])];
    expect(getPartnerFeed(records, ["partner-Comfy"], true).map((item) => item.id)).toEqual(["selected-pending"]);
  });
  it("shows all authorized relations for all-partners selection", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={partners} selectedPartners={null} pendingOnly={false} onSelect={() => undefined} />);
    expect((html.match(/class="promo-card"/g) ?? [])).toHaveLength(promos.length);
    expect(html).toContain("<strong>Citrus:");
  });
  it("shows an empty state when no partners are selected", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={partners} selectedPartners={[]} pendingOnly={false} onSelect={() => undefined} />);
    expect(html).toContain("Партнерів не обрано");
    expect(html).not.toContain("class=" + '"promo-card"');
  });
  it("prunes stale selected partners before rendering mobile cards", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={[partners[0]!]} selectedPartners={["partner-Removed"]} pendingOnly={false} onSelect={() => undefined} />);
    expect(html).toContain("Партнерів не обрано");
    expect(html).not.toContain("Promo b");
  });
  it("keeps the mobile FSM badge markup unchanged with Prolonged", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={[{ ...promos[0]!, specialPromo: { kind: "FSM" }, prolongedAt: "2026-09-29T10:00:00.000Z" }]} partners={partners} selectedPartners={null} pendingOnly={false} onSelect={() => undefined} />);
    expect(html).toContain('class="special-promo-badge">FSM</span>');
    expect(html).toContain("class=\"prolonged-badge\">Prolonged</span>");
    expect(html).toContain("promo-name-with-metadata");
  });
  it.each([
    [{ kind: "CREDIT", bank: "MONO", mechanic: "ПЧ10" }, "mono-credit-badge", "data:image/svg+xml", "Кредитне промо mono", "ПЧ10"],
    [{ kind: "CREDIT", bank: "PRIVATBANK", mechanic: "ОЧ25" }, "privatbank-credit-badge", "/src/assets/privatbank-logo.png", "Кредитне промо ПриватБанк", "ОЧ25"],
  ] as const)("renders a mobile %s logo badge without its mechanic", (specialPromo, badgeClass, assetRef, label, mechanic) => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={[{ ...promos[0]!, name: `Promo ${mechanic}`, specialPromo, prolongedAt: "2026-09-29T10:00:00.000Z" }]} partners={partners} selectedPartners={null} pendingOnly={false} onSelect={() => undefined} />);
    const badge = html.match(/<span class="special-promo-badge credit-promo-badge [^"]+"[^>]*>.*?<\/span>/)?.[0] ?? "";
    expect(badge).toContain(badgeClass);
    expect(badge).toContain(`src="${assetRef}`);
    expect(badge).toContain(`aria-label="${label}"`);
    expect(badge).toContain('alt="" aria-hidden="true"');
    expect(badge).not.toContain(mechanic);
    expect(html).toContain(`Promo ${mechanic}`);
    expect(html).toContain('class="prolonged-badge">Prolonged</span>');
  });
  it("renders no special badge for standard mobile promos", () => {
    const html = renderToStaticMarkup(<MobilePartnerFeed promos={promos} partners={partners} selectedPartners={null} pendingOnly={false} onSelect={() => undefined} />);
    expect(html).not.toContain("special-promo-badge");
  });
});
