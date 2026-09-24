import { LOB_RULES, PARTNER_ALIASES } from "./parsePromoSubject.config.js";
import type { Lob } from "./parsePromoSubject.types.js";

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

function matchesLobKeyword(subject: string, keyword: string): boolean {
  const phrase = escapeRegExp(keyword).replace(/\s+/g, String.raw`\s+`);
  return new RegExp(String.raw`(?:^|[^\p{L}\p{N}])${phrase}(?=$|[^\p{L}\p{N}])`, "iu").test(subject);
}

function inferLob(subject: string): Lob | null {
  const normalized = subject.toLocaleLowerCase();
  const hasWatch = ["apple watch", "watch se", "watch series"].some((keyword) => matchesLobKeyword(normalized, keyword));
  const hasAirPods = matchesLobKeyword(normalized, "airpods");
  if (hasWatch && hasAirPods) return "AW & AirPods";
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

export function normalizePromoName(promoName: string): string {
  return promoName
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function uniqueWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings)];
}
