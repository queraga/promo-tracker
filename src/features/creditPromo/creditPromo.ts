export type CreditBank = "MONO" | "PRIVATBANK";
export type CreditPromoMetadata = { bank: CreditBank; mechanic: string | null };
export type SpecialPromoMetadata = { kind: "FSM" } | { kind: "CREDIT"; bank: CreditBank; mechanic: string | null };
export type CreditClassification = { kind: "credit"; metadata: CreditPromoMetadata } | { kind: "conflict"; reason: "conflicting-credit-signals" } | null;

export const ATOMIC_CREDIT_LOBS = ["iPhone", "Mac", "iPad", "AW", "AirPods", "ACCY"] as const;

const PRIVAT_MARKER = /(?:^|[^\p{L}\p{N}])(?:ОЧ|OCH)[ \t]*(\d+)(?=$|[^\p{L}\p{N}])/giu;
const MONO_MARKER = /(?:^|[^\p{L}\p{N}])(?:ПЧ|PCH)[ \t]*(\d+)(?=$|[^\p{L}\p{N}])/giu;
const MONO_BRAND = /(?:^|[^\p{L}\p{N}])(?:monomarket|мономаркет|mono[\s-]+market|моно[\s-]+маркет|monobank|монобанк|mono[\s-]+bank|моно[\s-]+банк|mono|моно)(?=$|[^\p{L}\p{N}])/giu;
const ALL_LOB = /(?:^|[^\p{L}\p{N}])all\s+lob(?=$|[^\p{L}\p{N}])/iu;

function canonicalMechanics(source: string, marker: RegExp, prefix: "ОЧ" | "ПЧ"): string[] {
  marker.lastIndex = 0;
  return [...source.matchAll(marker)].map((match) => `${prefix}${canonicalDigits(match[1]!)}`);
}

function canonicalDigits(value: string): string { return value.replace(/^0+(?=\d)/u, ""); }

export function classifyCreditPromo(source: string): CreditClassification {
  const privatMechanics = [...new Set(canonicalMechanics(source, PRIVAT_MARKER, "ОЧ"))];
  const monoMechanics = [...new Set(canonicalMechanics(source, MONO_MARKER, "ПЧ"))];
  const monoBrand = MONO_BRAND.test(source);
  MONO_BRAND.lastIndex = 0;
  const privat = privatMechanics.length > 0;
  const mono = monoMechanics.length > 0 || monoBrand;

  if ((privat && mono) || privatMechanics.length > 1 || monoMechanics.length > 1) {
    return { kind: "conflict", reason: "conflicting-credit-signals" };
  }
  if (privat) return { kind: "credit", metadata: { bank: "PRIVATBANK", mechanic: privatMechanics[0]! } };
  if (mono) return { kind: "credit", metadata: { bank: "MONO", mechanic: monoMechanics[0] ?? null } };
  return null;
}

export function isAllLobRequest(source: string): boolean {
  return ALL_LOB.test(source);
}

export function canonicalizeCreditMechanicName(name: string): string {
  return name
    .replace(/(^|[^\p{L}\p{N}])(?:ОЧ|OCH)[ \t]*(\d+)(?=$|[^\p{L}\p{N}])/giu, (_match, before: string, digits: string) => `${before}ОЧ${canonicalDigits(digits)}`)
    .replace(/(^|[^\p{L}\p{N}])(?:ПЧ|PCH)[ \t]*(\d+)(?=$|[^\p{L}\p{N}])/giu, (_match, before: string, digits: string) => `${before}ПЧ${canonicalDigits(digits)}`);
}

export function deriveSpecialPromoMetadata(name: string): SpecialPromoMetadata | null {
  const fsm = /(?:^|[^\p{L}\p{N}])FSM(?=$|[^\p{L}\p{N}])/iu.test(name);
  const credit = classifyCreditPromo(name);
  if (fsm && credit) return null;
  if (fsm) return { kind: "FSM" };
  if (credit?.kind === "credit") return { kind: "CREDIT", ...credit.metadata };
  return null;
}
