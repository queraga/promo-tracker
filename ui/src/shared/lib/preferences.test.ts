import { describe, expect, it } from "vitest";
import { dashboardPartnerPreferenceKey, readDashboardPartners, reconcileDashboardPartners, writeDashboardPartners, type PreferenceStorage } from "./preferences";

class MemoryStorage implements PreferenceStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const available = [{ id: "rozetka-id", name: "Rozetka" }, { id: "comfy-id", name: "Comfy" }];

describe("unified dashboard partner preference", () => {
  it("starts with all partners and stores selection per user", () => {
    const storage = new MemoryStorage();
    expect(readDashboardPartners(storage, 7, available)).toBeNull();
    writeDashboardPartners(storage, 7, ["comfy-id"]);
    expect(readDashboardPartners(storage, 7, available)).toEqual(["comfy-id"]);
    expect(readDashboardPartners(storage, 8, available)).toBeNull();
  });
  it("uses a new versioned key and never imports old partial column preferences", () => {
    const storage = new MemoryStorage();
    storage.setItem("promo-tracker:partner-columns:7", JSON.stringify(["Comfy"]));
    expect(dashboardPartnerPreferenceKey(7)).toBe("promo-tracker:dashboard-partners:v1:7");
    expect(readDashboardPartners(storage, 7, available)).toBeNull();
  });
  it("persists an intentionally empty selection and represents select all as null", () => {
    const storage = new MemoryStorage();
    writeDashboardPartners(storage, 7, []);
    expect(readDashboardPartners(storage, 7, available)).toEqual([]);
    writeDashboardPartners(storage, 7, null);
    expect(readDashboardPartners(storage, 7, available)).toBeNull();
  });
  it("prunes stale IDs and keeps the safest empty selection if every saved partner is stale", () => {
    const storage = new MemoryStorage();
    writeDashboardPartners(storage, 7, ["comfy-id", "removed-id"]);
    expect(readDashboardPartners(storage, 7, available)).toEqual(["comfy-id"]);
    writeDashboardPartners(storage, 7, ["removed-id"]);
    expect(readDashboardPartners(storage, 7, available)).toEqual([]);
  });
  it("promotes an assigned-name fallback to its stable ID once associated", () => {
    const storage = new MemoryStorage();
    writeDashboardPartners(storage, 7, ["unassociated:Rozetka"]);
    expect(readDashboardPartners(storage, 7, available)).toEqual(["rozetka-id"]);
    expect(storage.getItem(dashboardPartnerPreferenceKey(7))).toBe(JSON.stringify(["rozetka-id"]));
  });
  it("reconciles persisted selection after workspace scope or associations change", () => {
    const storage = new MemoryStorage();
    writeDashboardPartners(storage, 7, ["rozetka-id", "comfy-id"]);
    expect(reconcileDashboardPartners(storage, 7, ["rozetka-id", "comfy-id"], [available[0]!])).toEqual(["rozetka-id"]);
    expect(readDashboardPartners(storage, 7, [available[0]!])).toEqual(["rozetka-id"]);
  });
  it("handles browser storage failures without breaking in-memory behavior", () => {
    const broken: PreferenceStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(readDashboardPartners(broken, 7, available)).toBeNull();
    expect(() => writeDashboardPartners(broken, 7, [])).not.toThrow();
  });
});
