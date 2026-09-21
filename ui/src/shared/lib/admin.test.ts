import { describe, expect, it } from "vitest";
import type { CurrentUser, PromoDto } from "../../types";
import { canManagePromos, removePartnerFromState, removePromoFromState } from "./admin";

const user = (role: CurrentUser["role"]): CurrentUser => ({ id: 1, email: "user@example.com", role });
const promos: PromoDto[] = [{ id: "promo-1", lob: "AW", name: "Promo", startDate: "2026-09-01", endDate: "2026-09-02", status: "finished", partners: [{ promoPartnerId: "relation-1", partnerId: "partner-1", partnerName: "Rozetka", reportReceived: false, reportReceivedAt: null, rawEmailSubject: "Promo" }, { promoPartnerId: "relation-2", partnerId: "partner-2", partnerName: "MOYO", reportReceived: false, reportReceivedAt: null, rawEmailSubject: "Promo" }] }];

describe("admin UI logic", () => {
  it("hides admin controls from KAM", () => expect(canManagePromos(user("KAM"))).toBe(false));
  it("shows admin controls to SUPERUSER", () => expect(canManagePromos(user("SUPERUSER"))).toBe(true));
  it("removes a deleted promo from UI state", () => expect(removePromoFromState(promos, "promo-1")).toEqual([]));
  it("removes only the selected partner from UI state", () => { const updated = removePartnerFromState(promos, "promo-1", "partner-1"); expect(updated[0].partners.map((partner) => partner.partnerName)).toEqual(["MOYO"]); });
});
