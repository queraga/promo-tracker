import { LOB_RULES, PARTNER_ALIASES } from "./parsePromoSubject.config.js";
import type { Lob } from "./parsePromoSubject.types.js";
import { canonicalizeCreditMechanicName, classifyCreditPromo } from "../creditPromo/creditPromo.js";

const DATE_RANGE_SOURCE = String.raw`(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\s*[-–]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?`;

export type ResolvedPeriod = {
  startDate: string;
  endDate: string;
};

export type DateExtraction = {
  period: ResolvedPeriod | null;
  warning?: string;
};

export function stripEmailPrefixes(subject: string): string {
  let result = subject.trim();
  const prefix = /^(?:(?:re|fw|fwd)\s*:|update!?)\s*/i;

  while (prefix.test(result)) {
    result = result.replace(prefix, "").trimStart();
  }

  return result;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function extractDateRanges(subject: string, currentDate: Date): DateExtraction {
  const explicit = /^\s*(?:період|period)\s*:\s*(.+)$/imu.exec(subject);
  const source = explicit?.[1] ?? subject;
  const matches = [...source.matchAll(new RegExp(DATE_RANGE_SOURCE, "g"))];
  if (matches.length === 0) {
    return { period: null, warning: "Promo period could not be detected" };
  }

  const startYear = currentDate.getFullYear();
  const periods: ResolvedPeriod[] = [];

  for (const match of matches) {
    const [, startDayText, startMonthText, explicitStartYear, endDayText, endMonthText, explicitEndYear] = match;
    const startDay = Number(startDayText);
    const startMonth = Number(startMonthText);
    const endDay = Number(endDayText);
    const endMonth = Number(endMonthText);
    const resolvedStartYear = explicitStartYear ? Number(explicitStartYear) : explicitEndYear ? Number(explicitEndYear) : startYear;
    const endYear = explicitEndYear ? Number(explicitEndYear) : endMonth < startMonth ? resolvedStartYear + 1 : resolvedStartYear;

    if (
      !isRealDate(resolvedStartYear, startMonth, startDay) ||
      !isRealDate(endYear, endMonth, endDay)
    ) {
      return { period: null, warning: "Invalid promo period detected" };
    }

    const startDate = isoDate(resolvedStartYear, startMonth, startDay);
    const endDate = isoDate(endYear, endMonth, endDay);
    if (endDate < startDate) {
      return { period: null, warning: "Invalid promo period detected" };
    }

    periods.push({ startDate, endDate });
  }

  const uniquePeriods = new Map(
    periods.map((period) => [`${period.startDate}/${period.endDate}`, period]),
  );
  if (uniquePeriods.size > 1) {
    return { period: null, warning: "Multiple different promo periods detected" };
  }

  return { period: periods[0] };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PartnerMatch = { canonical: string; start: number; end: number };

function normalizePartnerAlias(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function allPartnerMatches(subject: string): PartnerMatch[] {
  const matches: PartnerMatch[] = [];
  for (const [canonical, aliases] of Object.entries(PARTNER_ALIASES)) {
    const normalizedAliases = aliases
      .map(normalizePartnerAlias)
      .sort((left, right) => right.length - left.length);
    for (const alias of normalizedAliases) {
      const phrase = alias.split(" ").map(escapeRegExp).join(String.raw`[^\p{L}\p{N}]+`);
      const boundaryMatch = new RegExp(String.raw`(?:^|[^\p{L}\p{N}])(${phrase})(?=$|[^\p{L}\p{N}])`, "giu");
      for (const match of subject.matchAll(boundaryMatch)) {
        const offset = match[0].indexOf(match[1]);
        matches.push({ canonical, start: match.index + offset, end: match.index + offset + match[1].length });
      }
    }
  }
  return matches.sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start));
}

export function extractPartnerCandidates(subject: string): string[] {
  return [...new Set(allPartnerMatches(subject).map(({ canonical }) => canonical))];
}

export function isFsmPromoSubject(subject: string): boolean {
  return /(?:^|[^\p{L}\p{N}])FSM(?=$|[^\p{L}\p{N}])/iu.test(subject);
}

function findPartnerMatch(subject: string): PartnerMatch | null {
  const matches = allPartnerMatches(subject);
  const score = (match: PartnerMatch) => {
    const before = subject.slice(0, match.start);
    const after = subject.slice(match.end);
    let value = 0;
    if (/\s[-–]\s*$/u.test(before)) value += 4;
    if (/^[\s.,;:()\-–]*$/u.test(after)) value += 4;
    if (new RegExp(String.raw`^[^\p{L}\p{N}]*${DATE_RANGE_SOURCE}`, "iu").test(after)) value += 3;
    if (new RegExp(String.raw`${DATE_RANGE_SOURCE}[^\p{L}\p{N}]*$`, "iu").test(before)) value += 3;
    return value;
  };
  return matches.sort((left, right) => score(right) - score(left) || left.start - right.start)[0] ?? null;
}

export function extractPartner(subject: string): string | null {
  const explicit = /^\s*(?:partner|партнер)\s*:\s*(.+)$/gimu.exec(subject);
  if (explicit) {
    const explicitPartner = findPartnerMatch(explicit[1])?.canonical;
    if (explicitPartner) return explicitPartner;
  }
  return findPartnerMatch(subject)?.canonical ?? null;
}

export type CreditPartnerList = {
  partners: string[];
  line: number;
  error: "incomplete" | "ambiguous" | "too-few" | null;
  explicit: boolean;
} | null;

function resolvePartnerEntry(entry: string): string | null {
  const normalized = normalizePartnerAlias(entry);
  if (!normalized) return null;
  const matches = Object.entries(PARTNER_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => normalizePartnerAlias(alias) === normalized))
    .map(([canonical]) => canonical);
  return matches.length === 1 ? matches[0]! : null;
}

function segmentPartnerText(value: string): { sequence: string[]; ambiguous: boolean } | null {
  const tokens = normalizePartnerAlias(value).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  const aliases = Object.entries(PARTNER_ALIASES).flatMap(([canonical, values]) =>
    [...new Set(values.map(normalizePartnerAlias))].map((alias) => ({ canonical, tokens: alias.split(" ") })),
  );
  const memo = new Map<number, string[][]>();
  const segment = (offset: number): string[][] => {
    if (offset === tokens.length) return [[]];
    const cached = memo.get(offset);
    if (cached) return cached;
    const paths: string[][] = [];
    for (const alias of aliases) {
      if (!alias.tokens.every((token, index) => tokens[offset + index] === token)) continue;
      for (const tail of segment(offset + alias.tokens.length)) {
        paths.push([alias.canonical, ...tail]);
        if (paths.length > 32) break;
      }
      if (paths.length > 32) break;
    }
    memo.set(offset, paths);
    return paths;
  };
  const paths = segment(0);
  if (paths.length === 0) return null;
  const uniquePaths = [...new Map(paths.map((path) => [path.join("\u0000"), path])).values()];
  return { sequence: uniquePaths[0]!, ambiguous: uniquePaths.length > 1 };
}

/**
 * Reads partner lists only from explicit Partners fields or a dedicated
 * bullet line between a credit-classified line and a date-only line.
 */
export function extractCreditPartnerList(subject: string): CreditPartnerList {
  const lines = subject.split(/\r?\n/u);
  const explicitIndexes = lines.flatMap((line, index) => /^\s*(?:[-–]\s*)?partners\s*:/iu.test(line) ? [index] : []);
  const explicitIndex = explicitIndexes[0] ?? -1;
  if (explicitIndex >= 0) {
    if (explicitIndexes.length > 1) return { partners: [], line: explicitIndex, error: "ambiguous", explicit: true };
    const value = lines[explicitIndex]!.replace(/^\s*(?:[-–]\s*)?partners\s*:\s*/iu, "");
    const entries = value.split(/[,;]/u).map((entry) => entry.trim());
    const resolved = entries.map(resolvePartnerEntry);
    if (entries.length === 0 || entries.some((entry) => !entry) || resolved.some((partner) => !partner)) {
      return { partners: [], line: explicitIndex, error: "incomplete", explicit: true };
    }
    const partners = [...new Set(resolved as string[])];
    return { partners, line: explicitIndex, error: null, explicit: true };
  }

  const dateOnly = new RegExp(String.raw`^\s*[-–]?\s*\(?\s*${DATE_RANGE_SOURCE}\s*\)?\s*$`, "iu");
  const candidates: CreditPartnerList[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const bullet = /^\s*[-–]\s*(.+?)\s*$/u.exec(line);
    if (!bullet || !lines[index + 1] || !dateOnly.test(lines[index + 1]!)) continue;
    const priorNonEmpty = lines.slice(0, index).reverse().find((candidate) => candidate.trim().length > 0);
    if (!priorNonEmpty || classifyCreditPromo(priorNonEmpty)?.kind !== "credit") continue;
    const segmented = segmentPartnerText(bullet[1]!);
    if (!segmented) {
      candidates.push({ partners: [], line: index, error: "incomplete", explicit: false });
      continue;
    }
    const partners = [...new Set(segmented.sequence)];
    // A single exact alias remains on the legacy scalar path. An actual
    // list with duplicates only is incomplete because it has fewer than two
    // distinct partners.
    if (segmented.sequence.length === 1 && partners.length === 1) continue;
    const error = segmented.ambiguous ? "ambiguous" : partners.length < 2 ? "too-few" : null;
    candidates.push({ partners, line: index, error, explicit: false });
  }
  if (candidates.length === 0) return null;
  if (candidates.length > 1) return { partners: [], line: candidates[0]!.line, error: "ambiguous", explicit: false };
  return candidates[0]!;
}

function matchesLobKeyword(subject: string, keyword: string): boolean {
  const phrase = escapeRegExp(keyword).replace(/\s+/g, String.raw`\s+`);
  return new RegExp(String.raw`(?:^|[^\p{L}\p{N}])${phrase}(?=$|[^\p{L}\p{N}])`, "iu").test(subject);
}

function inferLob(subject: string): Lob | null {
  const normalized = subject.toLocaleLowerCase();
  const hasWatch = ["apple watch", "watch se", "watch series"].some((keyword) => matchesLobKeyword(normalized, keyword));
  const hasAirPods = matchesLobKeyword(normalized, "airpods");
  if (hasWatch && hasAirPods) return "AW & AirPods";
  const hasMac = ["mac", "macbook", "mac mini", "imac"].some((keyword) => matchesLobKeyword(normalized, keyword));
  const hasIpad = matchesLobKeyword(normalized, "ipad");
  if (hasMac && hasIpad) return "Mac iPad";
  for (const rule of LOB_RULES) {
    const matchesKeyword = rule.keywords.some((keyword) => matchesLobKeyword(normalized, keyword));
    if (matchesKeyword) {
      return rule.lob;
    }
  }
  return null;
}

export function detectLob(subject: string): Lob | null {
  const explicit = /^\s*lob\s*:\s*(.+)$/gimu.exec(subject);
  if (explicit) {
    const explicitLob = inferLob(explicit[1]);
    if (explicitLob) return explicitLob;
  }
  return inferLob(subject);
}

export function buildPromoName(cleanedSubject: string, partner: string | null): string {
  const lobLine = cleanedSubject.split(/\r?\n/u).find((line) => /^\s*lob\s*:/iu.test(line));
  let result = lobLine ? lobLine.replace(/^\s*lob\s*:\s*/iu, "") : cleanedSubject;

  if (partner) {
    const match = findPartnerMatch(result);
    if (match?.canonical === partner) {
      const before = result.slice(0, match.start).replace(/\s+[-–]\s*$/u, " ");
      result = before + result.slice(match.end);
    }
  }

  const periodWithDecoration = new RegExp(
    String.raw`(?:(?:період|period)\s*)?\(?\s*${DATE_RANGE_SOURCE}\s*\)?`,
    "giu",
  );
  result = result.replace(periodWithDecoration, " ");

  return result
    .replace(/^\s*(?:partner|партнер)\s*:.+$/gimu, " ")
    .replace(/^\s*(?:період|period)\s*:.+$/gimu, " ")
    .replace(/\s+/gu, " ")
    .replace(/\s+([,;:])/gu, "$1")
    .trim()
    .replace(/[\s\-–,;:.]+$/u, "")
    .trim();
}

export function buildCreditPromoName(cleanedSubject: string, partner: string | null, partnerListLine?: number): string {
  const meaningfulLines = cleanedSubject.split(/\r?\n/u).filter((line, index) =>
    index !== partnerListLine && !/^\s*(?:lob|partner|партнер|partners|період|period)\s*:/iu.test(line),
  );
  const source = meaningfulLines.join(" ").trim() || cleanedSubject;
  return buildPromoName(source, partnerListLine === undefined ? partner : null);
}

export function buildFsmPromoName(cleanedSubject: string, partner: string | null): string {
  const name = buildPromoName(cleanedSubject, partner);
  return isFsmPromoSubject(name) ? name : `FSM ${name}`;
}

export function normalizePromoName(promoName: string): string {
  return promoName
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeCreditPromoName(promoName: string): string {
  return normalizePromoName(canonicalizeCreditMechanicName(promoName));
}

export function uniqueWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings)];
}
