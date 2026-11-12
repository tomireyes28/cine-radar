import {
  buildArgentinaDate,
  isValidCalendarDate,
} from '../../common/utils/argentina-time.util';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function arrayOf(
  value: unknown,
  predicate: (item: unknown) => boolean,
): boolean {
  return Array.isArray(value) && (value as unknown[]).every(predicate);
}
export function validProviderTime(day: unknown, time: unknown): boolean {
  return (
    typeof day === 'string' &&
    isValidCalendarDate(day.slice(0, 10)) &&
    typeof time === 'string' &&
    /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?Z?)?$/.test(time) &&
    !isNaN(buildArgentinaDate(day, time).getTime())
  );
}
export function validShowcaseTree(value: unknown): boolean {
  return (
    record(value) &&
    text(value.name) &&
    record(value.days) &&
    Object.entries(value.days).every(
      ([day, cinemas]) =>
        isValidCalendarDate(day) &&
        arrayOf(
          cinemas,
          (cinema) =>
            record(cinema) &&
            text(cinema.name) &&
            arrayOf(
              cinema.formats,
              (format) =>
                record(format) &&
                text(format.formatDescription) &&
                arrayOf(
                  format.performances,
                  (perf) =>
                    record(perf) && validProviderTime(day, perf.showTime),
                ),
            ),
        ),
    )
  );
}
export function validCinepolisSchedule(value: unknown): boolean {
  return (
    record(value) &&
    text(value.cinemaId) &&
    arrayOf(
      value.dates,
      (group) =>
        record(group) &&
        typeof group.date === 'string' &&
        isValidCalendarDate(group.date.slice(0, 10)) &&
        arrayOf(
          group.languages,
          (language) =>
            record(language) &&
            text(language.language) &&
            arrayOf(
              language.showtimes,
              (show) =>
                record(show) &&
                typeof show.datetime === 'string' &&
                validProviderTime(
                  show.datetime.slice(0, 10),
                  show.datetime.slice(11, 16),
                ),
            ),
        ),
    )
  );
}
