import { addDays, format, parseISO } from 'date-fns';

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';
export const MAX_INT4 = 2_147_483_647;

/** Today's date in Argentina as `yyyy-MM-dd`, independent of the server/browser timezone. */
export function getTodayArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ARGENTINA_TZ }).format(
    new Date(),
  );
}

/**
 * Strictly validates a real Gregorian calendar date in `YYYY-MM-DD` format.
 * Rejects partial dates, timestamps, arrays, and impossible days (`2026-02-30`),
 * while accepting leap days on leap years (`2024-02-29`, `2028-02-29`).
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
export function isValidPositiveInt4(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_INT4;
}

/**
 * Resolves a raw `date` query parameter (which may be missing, malformed, or an array)
 * into a guaranteed valid `YYYY-MM-DD` calendar date string.
 */
export function resolveSelectedDate(
  rawDate: string | string[] | undefined | null,
  fallback: string = getTodayArgentina(),
): string {
  return isValidCalendarDate(rawDate) ? rawDate : fallback;
}

/**
 * Sanitizes an optional positive 32-bit integer query parameter (`chainId`, `cinemaId`).
 */
export function sanitizePositiveIntParam(
  raw: string | string[] | undefined | null,
): string | undefined {
  return isValidPositiveInt4(raw) ? raw : undefined;
}

/**
 * Sanitizes an optional plain text query parameter (`zone`, `city`).
 */
export function sanitizeStringParam(
  raw: string | string[] | undefined | null,
  maxLength = 100,
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

/**
 * Validates a pair of geographic coordinate query params (`lat`, `lng`).
 */
export function parseCoordinatePair(
  rawLat: string | string[] | undefined | null,
  rawLng: string | string[] | undefined | null,
): { lat: string; lng: string } | null {
  if (typeof rawLat !== 'string' || typeof rawLng !== 'string') {
    return null;
  }
  const latStr = rawLat.trim();
  const lngStr = rawLng.trim();
  if (!latStr || !lngStr) return null;

  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat: String(lat), lng: String(lng) };
}

/** Consecutive `yyyy-MM-dd` strings starting today (Argentina). */
export function buildDateRange(days = 7): string[] {
  const today = parseISO(getTodayArgentina());
  return Array.from({ length: days }, (_, i) =>
    format(addDays(today, i), 'yyyy-MM-dd'),
  );
}

/** Formats an ISO instant as `HH:mm` in Argentina time (server and client render identically). */
export function formatTimeAR(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ARGENTINA_TZ,
  }).format(new Date(iso));
}
