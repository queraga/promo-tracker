import type { PartnerOption } from "../../types";

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const dashboardPartnerPreferenceKey = (userId: number) => `promo-tracker:dashboard-partners:v1:${userId}`;

function reconcileSelection(selected: string[] | null, available: PartnerOption[]): string[] | null {
  if (selected === null) return null;
  const availableIds = new Set(available.map(({ id }) => id));
  const availableNames = new Map(available.map(({ name, id }) => [name, id]));
  const reconciled = selected.flatMap((id) => {
    if (availableIds.has(id)) return [id];
    if (id.startsWith("unassociated:")) {
      const promotedId = availableNames.get(id.slice("unassociated:".length));
      if (promotedId) return [promotedId];
    }
    return [];
  });
  return [...new Set(reconciled)];
}

export function readDashboardPartners(storage: PreferenceStorage, userId: number, available: PartnerOption[]): string[] | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(dashboardPartnerPreferenceKey(userId)) ?? "null");
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
    const selected = reconcileSelection([...new Set(value)], available) ?? [];
    writeDashboardPartners(storage, userId, selected);
    return selected;
  } catch { return null; }
}

export function writeDashboardPartners(storage: PreferenceStorage, userId: number, selected: string[] | null): void {
  try {
    if (selected === null) storage.removeItem(dashboardPartnerPreferenceKey(userId));
    else storage.setItem(dashboardPartnerPreferenceKey(userId), JSON.stringify([...new Set(selected)]));
  } catch { /* Browser storage may be disabled. The in-memory selection still works. */ }
}

export function reconcileDashboardPartners(storage: PreferenceStorage, userId: number, selected: string[] | null, available: PartnerOption[]): string[] | null {
  const reconciled = reconcileSelection(selected, available);
  writeDashboardPartners(storage, userId, reconciled);
  return reconciled;
}
