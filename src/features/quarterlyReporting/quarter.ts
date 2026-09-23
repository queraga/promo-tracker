export type CalendarQuarter = { year: number; quarter: 1 | 2 | 3 | 4 };

const calendarParts = (value: Date | string): { year: number; month: number; day: number } => {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) throw new Error("Invalid calendar date");
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
};

export function quarterForEndDate(value: Date | string): CalendarQuarter {
  const { year, month } = calendarParts(value);
  return { year, quarter: Math.ceil(month / 3) as CalendarQuarter["quarter"] };
}

export function quarterDateRange(year: number, quarter: number): { start: Date; end: Date } {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || ![1, 2, 3, 4].includes(quarter)) throw new Error("Invalid reporting quarter");
  return {
    start: new Date(Date.UTC(year, (quarter - 1) * 3, 1)),
    end: new Date(Date.UTC(year, quarter * 3, 1)),
  };
}

export const quarterKeyForEndDate = (value: Date | string): string => {
  const { year, quarter } = quarterForEndDate(value);
  return `${year}-Q${quarter}`;
};
