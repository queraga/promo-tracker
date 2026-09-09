export function formatFullDate(value: string | Date): string {
  if (typeof value === "string") {
    const [year, month, day] = value.split("-").map(Number);
    return `${pad(day)}.${pad(month)}.${year}`;
  }
  return `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`;
}

export function formatCompactPeriod(startDate: Date, endDate: Date): string {
  return `${pad(startDate.getUTCDate())}.${pad(startDate.getUTCMonth() + 1)}-${pad(
    endDate.getUTCDate(),
  )}.${pad(endDate.getUTCMonth() + 1)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
