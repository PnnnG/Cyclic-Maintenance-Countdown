const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isoDateParts = (value: string): [number, number, number] | undefined => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return undefined;
  return [year, month, day];
};

const formatIsoParts = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const todayIsoInTimeZone = (timeZone?: string, now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return formatIsoParts(Number(values.year), Number(values.month), Number(values.day));
};

export const addCalendarDays = (value: string, days: number): string | undefined => {
  const parts = isoDateParts(value);
  if (!parts || !Number.isInteger(days)) return undefined;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return formatIsoParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

export const calendarDayDifference = (later: string, earlier: string): number | undefined => {
  const laterParts = isoDateParts(later);
  const earlierParts = isoDateParts(earlier);
  if (!laterParts || !earlierParts) return undefined;
  const laterTime = Date.UTC(laterParts[0], laterParts[1] - 1, laterParts[2]);
  const earlierTime = Date.UTC(earlierParts[0], earlierParts[1] - 1, earlierParts[2]);
  return Math.round((laterTime - earlierTime) / 86_400_000);
};

export const dateOnlyValue = (value: string): Date | undefined => {
  const parts = isoDateParts(value);
  if (!parts) return undefined;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
};
