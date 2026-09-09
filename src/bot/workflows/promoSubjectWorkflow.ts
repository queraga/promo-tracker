import { parsePromoSubject } from "../../features/parsePromoSubject/parsePromoSubject.js";
import { formatPromoPreview } from "../formatters/formatPromoPreview.js";
import type { PendingPromoStore } from "../state/pendingPromoStore.js";
import type { PromoPreviewResult, TelegramIdentity } from "../types.js";

export function handlePromoSubject(
  text: string,
  identity: TelegramIdentity,
  store: PendingPromoStore,
  currentDate: Date = new Date(),
): PromoPreviewResult {
  if (text.trimStart().startsWith("/")) return { kind: "ignored" };
  const parsed = parsePromoSubject(text, currentDate);
  const preview = formatPromoPreview(parsed);
  if (!parsed.isValid) return { kind: "invalid", parsed, text: preview };
  const confirmationId = store.createPendingPromo(parsed, identity);
  return { kind: "preview", parsed, confirmationId, text: preview };
}
