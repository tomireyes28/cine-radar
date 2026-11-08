export const ARGENTINA_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const MAX_INT4 = 2_147_483_647;
const ARGENTINA_UTC_OFFSET = '-03:00';

/**
 * Strictly validates a real Gregorian calendar date in `YYYY-MM-DD` format.
 * Rejects timestamps, partial dates, and non-existent calendar days (e.g. 2026-02-30),
 * while accepting leap days on leap years (e.g. 2024-02-29, 2028-02-29).
 */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    !Number.isNaN(utc.getTime()) &&
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Strictly validates a positive 32-bit signed integer string (`1`..`2147483647`).
 */
export function isValidPositiveInt4String(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_INT4;
}

const argentinaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARGENTINA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Returns YYYY-MM-DD corresponding to the given instant in Argentina (UTC-3),
 * independent of the host server's local timezone.
 */
export function getArgentinaTodayDateString(now: Date = new Date()): string {
  return argentinaDateFormatter.format(now);
}

/**
 * Shifts a YYYY-MM-DD calendar date by `deltaDays` (positive or negative)
 * using pure UTC calendar arithmetic (immune to host timezone/DST).
 */
export function shiftCalendarDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  utcNoon.setUTCDate(utcNoon.getUTCDate() + deltaDays);
  return utcNoon.toISOString().slice(0, 10);
}

/**
 * Computes the exact start (00:00:00.000-03:00) and end (23:59:59.999-03:00)
 * instants for an Argentina calendar day.
 */
export function getArgentinaDayRange(
  dateStr?: string,
  now: Date = new Date(),
): { dateKey: string; start: Date; end: Date } {
  const dateKey = isValidCalendarDate(dateStr)
    ? dateStr
    : getArgentinaTodayDateString(now);

  const start = new Date(`${dateKey}T00:00:00.000${ARGENTINA_UTC_OFFSET}`);
  const end = new Date(`${dateKey}T23:59:59.999${ARGENTINA_UTC_OFFSET}`);
  return { dateKey, start, end };
}

/**
 * Returns 00:00:00.000-03:00 of the current day in Argentina.
 */
export function getArgentinaStartOfToday(now: Date = new Date()): Date {
  return getArgentinaDayRange(undefined, now).start;
}

/**
 * Returns 00:00:00.000-03:00 of yesterday in Argentina (safe cutoff for expired showtime cleanup).
 */
export function getArgentinaStartOfYesterday(now: Date = new Date()): Date {
  const todayAr = getArgentinaTodayDateString(now);
  const yesterdayAr = shiftCalendarDate(todayAr, -1);
  return new Date(`${yesterdayAr}T00:00:00.000${ARGENTINA_UTC_OFFSET}`);
}

/**
 * Builds a Date in Argentina Timezone (UTC-3) from YYYY-MM-DD and HH:mm.
 */
export function buildArgentinaDate(dateStr: string, timeStr: string): Date {
  const cleanDate = dateStr.trim().slice(0, 10);
  const [rawHours = '00', rawMinutes = '00'] = timeStr.trim().split(':');
  const hh = rawHours.padStart(2, '0');
  const mm = rawMinutes.padStart(2, '0');
  return new Date(`${cleanDate}T${hh}:${mm}:00.000${ARGENTINA_UTC_OFFSET}`);
}
