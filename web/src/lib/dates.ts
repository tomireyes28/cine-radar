import { addDays, format, parseISO } from 'date-fns';

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

/** Today's date in Argentina as `yyyy-MM-dd`, independent of the server/browser timezone. */
export function getTodayArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ARGENTINA_TZ }).format(
    new Date(),
  );
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
