const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parsePromoDate(value: string): Date {
  const match = ISO_CALENDAR_DATE.exec(value);
  if (!match) throw new Error(`Invalid promo date: ${value}`);

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid promo date: ${value}`);
  }

  return date;
}
