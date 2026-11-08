import {
  buildArgentinaDate,
  getArgentinaDayRange,
  getArgentinaStartOfToday,
  getArgentinaStartOfYesterday,
  getArgentinaTodayDateString,
  shiftCalendarDate,
} from './argentina-time.util';

describe('Argentina Time Utilities (F15)', () => {
  it('resolves previous Argentina calendar day when UTC clock has already crossed midnight (01:30Z = 22:30 ARG)', () => {
    // 2026-11-08 01:30:00 UTC is still 2026-11-07 22:30:00 in Buenos Aires
    const utcAfterMidnight = new Date('2026-11-08T01:30:00.000Z');

    expect(getArgentinaTodayDateString(utcAfterMidnight)).toBe('2026-11-07');

    const { dateKey, start, end } = getArgentinaDayRange(
      undefined,
      utcAfterMidnight,
    );
    expect(dateKey).toBe('2026-11-07');
    expect(start.toISOString()).toBe('2026-11-07T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-08T02:59:59.999Z');
    expect(getArgentinaStartOfToday(utcAfterMidnight).toISOString()).toBe(
      '2026-11-07T03:00:00.000Z',
    );
  });

  it('advances to new Argentina day exactly at 03:00:00.000Z (00:00:00 ARG)', () => {
    const arMidnight = new Date('2026-11-08T03:00:00.000Z');

    expect(getArgentinaTodayDateString(arMidnight)).toBe('2026-11-08');
    expect(getArgentinaStartOfToday(arMidnight).toISOString()).toBe(
      '2026-11-08T03:00:00.000Z',
    );
  });

  it('computes start of yesterday in Argentina across month and leap-year boundaries', () => {
    // 2026-03-01 01:00 UTC -> 2026-02-28 22:00 ARG -> yesterday is 2026-02-27
    const nonLeap = new Date('2026-03-01T01:00:00.000Z');
    expect(getArgentinaStartOfYesterday(nonLeap).toISOString()).toBe(
      '2026-02-27T03:00:00.000Z',
    );

    // 2028-03-01 04:00 UTC -> 2028-03-01 01:00 ARG (leap year) -> yesterday is 2028-02-29
    const leap = new Date('2028-03-01T04:00:00.000Z');
    expect(getArgentinaStartOfYesterday(leap).toISOString()).toBe(
      '2028-02-29T03:00:00.000Z',
    );
    expect(shiftCalendarDate('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('builds Argentina wall-clock timestamps consistently as UTC-3', () => {
    const dt = buildArgentinaDate('2026-11-07', '9:05');
    expect(dt.toISOString()).toBe('2026-11-07T12:05:00.000Z');
  });
});
