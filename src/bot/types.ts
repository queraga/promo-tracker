import type { ParsedPromoSubject } from "../features/parsePromoSubject/parsePromoSubject.types.js";

export type TelegramIdentity = { chatId: number; userId: number };

export type PromoPreviewResult =
  | { kind: "ignored" }
  | { kind: "invalid"; parsed: ParsedPromoSubject; text: string }
  | { kind: "preview"; parsed: ParsedPromoSubject; confirmationId: string; text: string };
