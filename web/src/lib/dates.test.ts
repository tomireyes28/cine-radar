import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { format, parseISO } from 'date-fns';
import {
  isValidCalendarDate,
  isValidPositiveInt4,
  parseCoordinatePair,
  resolveSelectedDate,
  sanitizePositiveIntParam,
} from './dates.ts';

describe('Frontend Date & Query Parameter Sanitization (F10)', () => {
  it('accepts real YYYY-MM-DD dates including leap days and rejects impossible calendar dates', () => {
    assert.equal(isValidCalendarDate('2026-11-08'), true);
    assert.equal(isValidCalendarDate('2024-02-29'), true);
    assert.equal(isValidCalendarDate('2028-02-29'), true);

    assert.equal(isValidCalendarDate('2026-02-29'), false);
    assert.equal(isValidCalendarDate('2026-02-30'), false);
    assert.equal(isValidCalendarDate('2026-04-31'), false);
    assert.equal(isValidCalendarDate('2026-11-08T12:00:00Z'), false);
    assert.equal(isValidCalendarDate(['2026-11-08']), false);
  });

  it('never throws in format(parseISO(...)) when arbitrary searchParams.date values are sanitized via resolveSelectedDate', () => {
    const fallback = '2026-11-08';

    for (const arbitrary of [
      undefined,
      '',
      'invalid-date',
      '2026-02-30',
      ['2026-11-08', '2026-11-09'],
    ]) {
      const safe = resolveSelectedDate(arbitrary, fallback);
      assert.equal(safe, fallback);
      assert.doesNotThrow(() => format(parseISO(safe), 'yyyy-MM-dd'));
    }

    assert.equal(resolveSelectedDate('2028-02-29', fallback), '2028-02-29');
  });

  it('accepts only positive 32-bit integers for IDs and sanitizes decimals, overflow, and arrays', () => {
    assert.equal(isValidPositiveInt4('1'), true);
    assert.equal(isValidPositiveInt4('2147483647'), true);

    for (const bad of [
      '0',
      '-1',
      '1.5',
      '01',
      '2147483648',
      '999999999999',
      ['1'],
      undefined,
    ]) {
      assert.equal(sanitizePositiveIntParam(bad), undefined);
    }
  });

  it('validates coordinate pairs strictly within geographic bounds', () => {
    assert.deepEqual(parseCoordinatePair('-34.6037', '-58.3816'), {
      lat: '-34.6037',
      lng: '-58.3816',
    });
    assert.equal(parseCoordinatePair('', ''), null);
    assert.equal(parseCoordinatePair('91', '-58'), null);
    assert.equal(parseCoordinatePair(['-34'], '-58'), null);
  });
});
