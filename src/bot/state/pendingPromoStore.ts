import { randomUUID } from "node:crypto";
import type { ParsedPromoSubject } from "../../features/parsePromoSubject/parsePromoSubject.types.js";
import type { TelegramIdentity } from "../types.js";

export type PendingPromo = TelegramIdentity & {
  parsed: ParsedPromoSubject;
  createdAt: number;
};

export type PendingPromoLookup =
  | { status: "found"; pending: PendingPromo }
  | { status: "expired" | "missing" | "forbidden" };

export class PendingPromoStore {
  private readonly promos = new Map<string, PendingPromo>();

  constructor(
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID,
  ) {}

  createPendingPromo(parsed: ParsedPromoSubject, identity: TelegramIdentity): string {
    this.cleanupExpiredPromos();
    const id = this.createId();
    this.promos.set(id, { ...identity, parsed, createdAt: this.now() });
    return id;
  }

  getPendingPromo(id: string, identity: TelegramIdentity): PendingPromoLookup {
    const pending = this.promos.get(id);
    if (!pending) return { status: "missing" };
    if (this.now() - pending.createdAt >= this.ttlMs) {
      this.promos.delete(id);
      return { status: "expired" };
    }
    if (pending.chatId !== identity.chatId || pending.userId !== identity.userId) {
      return { status: "forbidden" };
    }
    return { status: "found", pending };
  }

  deletePendingPromo(id: string, identity?: TelegramIdentity): boolean {
    const pending = this.promos.get(id);
    if (!pending) return false;
    if (identity && (pending.chatId !== identity.chatId || pending.userId !== identity.userId)) {
      return false;
    }
    return this.promos.delete(id);
  }

  cleanupExpiredPromos(): void {
    const currentTime = this.now();
    for (const [id, pending] of this.promos) {
      if (currentTime - pending.createdAt >= this.ttlMs) this.promos.delete(id);
    }
  }
}

export const pendingPromoStore = new PendingPromoStore();
