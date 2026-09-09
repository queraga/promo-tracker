import type { CreatePromoResult } from "../../features/createPromo/createPromo.types.js";
import type { ParsedPromoSubject } from "../../features/parsePromoSubject/parsePromoSubject.types.js";
import type { PendingPromoStore } from "../state/pendingPromoStore.js";
import type { TelegramIdentity } from "../types.js";

export type PromoCallbackResult =
  | { kind: "added"; result: CreatePromoResult }
  | { kind: "cancelled" | "expired" | "forbidden" | "missing" };

export async function handlePromoCallback(
  action: "add" | "cancel",
  confirmationId: string,
  identity: TelegramIdentity,
  store: PendingPromoStore,
  persist: (parsed: ParsedPromoSubject) => Promise<CreatePromoResult>,
): Promise<PromoCallbackResult> {
  const lookup = store.getPendingPromo(confirmationId, identity);
  if (lookup.status !== "found") return { kind: lookup.status };
  if (action === "cancel") {
    store.deletePendingPromo(confirmationId, identity);
    return { kind: "cancelled" };
  }
  const result = await persist(lookup.pending.parsed);
  store.deletePendingPromo(confirmationId, identity);
  return { kind: "added", result };
}
