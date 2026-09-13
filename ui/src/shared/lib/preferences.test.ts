import { describe, expect, it } from "vitest";
import { readMobilePartner, readPartnerColumns, writeMobilePartner, writePartnerColumns, type PreferenceStorage } from "./preferences";

class MemoryStorage implements PreferenceStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("browser preferences", () => {
  it("stores selected partner columns per user and filters stale names", () => {
    const storage = new MemoryStorage();
    writePartnerColumns(storage, 7, ["Rozetka", "Legacy"]);
    expect(readPartnerColumns(storage, 7, ["Rozetka", "Comfy"])).toEqual(["Rozetka"]);
    expect(readPartnerColumns(storage, 8, ["Rozetka"])).toBeNull();
  });
  it("removes the preference when all partners are selected", () => {
    const storage = new MemoryStorage();
    writePartnerColumns(storage, 7, ["Rozetka"]);
    writePartnerColumns(storage, 7, null);
    expect(readPartnerColumns(storage, 7, ["Rozetka"])).toBeNull();
  });
  it("ignores malformed preferences", () => {
    const storage = new MemoryStorage();
    storage.setItem("promo-tracker:partner-columns:7", "not json");
    expect(readPartnerColumns(storage, 7, ["Rozetka"])).toBeNull();
  });
  it("stores only an available mobile partner", () => {
    const storage = new MemoryStorage();
    writeMobilePartner(storage, 7, "Comfy");
    expect(readMobilePartner(storage, 7, ["Rozetka", "Comfy"])).toBe("Comfy");
    expect(readMobilePartner(storage, 7, ["Rozetka"])).toBe("");
  });
});
