export type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const partnerColumnsKey = (userId: number) => `promo-tracker:partner-columns:${userId}`;
export const mobilePartnerKey = (userId: number) => `promo-tracker:mobile-partner:${userId}`;

export function readPartnerColumns(storage: PreferenceStorage, userId: number, available: string[]): string[] | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(partnerColumnsKey(userId)) ?? "null");
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
    return [...new Set(value)].filter((partner) => available.includes(partner));
  } catch { return null; }
}

export function writePartnerColumns(storage: PreferenceStorage, userId: number, selected: string[] | null): void {
  try {
    if (selected === null) storage.removeItem(partnerColumnsKey(userId));
    else storage.setItem(partnerColumnsKey(userId), JSON.stringify(selected));
  } catch { /* Browser storage may be disabled. The in-memory selection still works. */ }
}

export function readMobilePartner(storage: PreferenceStorage, userId: number, available: string[]): string {
  try {
    const selected = storage.getItem(mobilePartnerKey(userId)) ?? "";
    return available.includes(selected) ? selected : "";
  } catch { return ""; }
}

export function writeMobilePartner(storage: PreferenceStorage, userId: number, selected: string): void {
  try {
    if (selected) storage.setItem(mobilePartnerKey(userId), selected);
    else storage.removeItem(mobilePartnerKey(userId));
  } catch { /* Browser storage may be disabled. */ }
}
