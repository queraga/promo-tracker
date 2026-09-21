import { LOB_RULES, PARTNER_ALIASES } from "./parsePromoSubject.config.js";
import type { Lob } from "./parsePromoSubject.types.js";

const DATE_RANGE_SOURCE = String.raw`(\d{1,2})\.(\d{1,2})\s*[-–]\s*(\d{1,2})\.(\d{1,2})`;

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
  const matches = [...subject.matchAll(new RegExp(DATE_RANGE_SOURCE, "g"))];
  if (matches.length === 0) {
    return { period: null, warning: "Promo period could not be detected" };
  }

  const startYear = currentDate.getFullYear();
  const periods: ResolvedPeriod[] = [];

  for (const match of matches) {
    const [, startDayText, startMonthText, endDayText, endMonthText] = match;
    const startDay = Number(startDayText);
    const startMonth = Number(startMonthText);
    const endDay = Number(endDayText);
    const endMonth = Number(endMonthText);
    const endYear = endMonth < startMonth ? startYear + 1 : startYear;

    if (
      !isRealDate(startYear, startMonth, startDay) ||
      !isRealDate(endYear, endMonth, endDay)
    ) {
      return { period: null, warning: "Invalid promo period detected" };
    }

    const startDate = isoDate(startYear, startMonth, startDay);
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

type PartnerMatch = { canonical: string; index: number };

function normalizePartnerAlias(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function findPartnerMatch(subject: string): PartnerMatch | null {
  for (const [canonical, aliases] of Object.entries(PARTNER_ALIASES)) {
    const normalizedAliases = aliases
      .map(normalizePartnerAlias)
      .sort((left, right) => right.length - left.length);
    for (const alias of normalizedAliases) {
      const phrase = alias.split(" ").map(escapeRegExp).join(String.raw`[^\p{L}\p{N}]+`);
      const suffix = new RegExp(
        String.raw`(?:^|[^\p{L}\p{N}])${phrase}[^\p{L}\p{N}]*$`,
        "iu",
      );
      const match = suffix.exec(subject);
      if (match) return { canonical, index: match.index };

      const beforeTrailingPeriod = new RegExp(
        String.raw`(?:^|\s[-–]\s)${phrase}(?=$|[^\p{L}\p{N}])(?:\s*\([^)]*\))?\s*[-–]\s*(?:(?:період|period)\s*)?\(?\s*${DATE_RANGE_SOURCE}\s*\)?\s*$`,
        "iu",
      );
      const structuredMatch = beforeTrailingPeriod.exec(subject);
      if (structuredMatch) return { canonical, index: structuredMatch.index };
    }
  }
  return null;
}

export function extractPartner(subject: string): string | null {
  return findPartnerMatch(subject)?.canonical ?? null;
}

export function detectLob(subject: string): Lob | null {
  const normalized = subject.toLocaleLowerCase();
  for (const rule of LOB_RULES) {
    const matchesKeyword = rule.keywords.some((keyword) => {
      const phrase = escapeRegExp(keyword).replace(/\s+/g, String.raw`\s+`);
      return new RegExp(
        String.raw`(?:^|[^\p{L}\p{N}])${phrase}(?=$|[^\p{L}\p{N}])`,
        "iu",
      ).test(normalized);
    });
    if (matchesKeyword) {
      return rule.lob;
    }
  }
  return null;
}

export function buildPromoName(cleanedSubject: string, partner: string | null): string {
  let result = cleanedSubject;

  const periodWithDecoration = new RegExp(
    String.raw`(?:(?:період|period)\s*)?\(?\s*${DATE_RANGE_SOURCE}\s*\)?`,
    "giu",
  );
  result = result.replace(periodWithDecoration, " ");

  if (partner) {
    const match = findPartnerMatch(result);
    if (match?.canonical === partner) result = result.slice(0, match.index);
  }

  return result
    .replace(/\s+/gu, " ")
    .replace(/\s+([,;:])/gu, "$1")
    .trim()
    .replace(/[\s\-–,;:]+$/u, "")
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
