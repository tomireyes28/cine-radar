import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { PositiveIntPipe } from '../../common/pipes/positive-int.pipe';
import { GetMoviesDto } from './get-movie.dto';
import { NearbyCinemasDto } from './nearby-cinemas.dto';

describe('Strict Calendar Date, Positive Int4 & Coordinate Validation (F10)', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const queryMeta: ArgumentMetadata = {
    type: 'query',
    metatype: GetMoviesDto,
  };

  const nearbyMeta: ArgumentMetadata = {
    type: 'query',
    metatype: NearbyCinemasDto,
  };

  it('accepts valid YYYY-MM-DD dates (including leap years) and valid 32-bit positive integer IDs', async () => {
    const valid = (await validationPipe.transform(
      {
        date: '2028-02-29',
        chainId: '1',
        cinemaId: '2147483647',
        zone: 'CABA',
      },
      queryMeta,
    )) as GetMoviesDto;

    expect(valid).toMatchObject({
      date: '2028-02-29',
      chainId: '1',
      cinemaId: '2147483647',
      zone: 'CABA',
    });
  });

  it('rejects impossible calendar dates (2026-02-30, non-leap 2026-02-29), timestamps, and arrays', async () => {
    for (const invalidDate of [
      '2026-02-30',
      '2026-02-29',
      '2026-04-31',
      '2026-13-01',
      '2026-11-08T00:00:00Z',
      '2026-11',
      'not-a-date',
      ['2026-11-08', '2026-11-09'],
    ]) {
      await expect(
        validationPipe.transform({ date: invalidDate }, queryMeta),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects decimal IDs (1.5), zero, negatives, INT4 overflow (>2147483647), and arrays in chainId/cinemaId', async () => {
    for (const invalidId of [
      '1.5',
      '0',
      '-1',
      '01',
      '1e2',
      '2147483648',
      '999999999999',
      'abc',
      ['1', '2'],
    ]) {
      await expect(
        validationPipe.transform({ chainId: invalidId }, queryMeta),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        validationPipe.transform({ cinemaId: invalidId }, queryMeta),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('validates route :id parameter via PositiveIntPipe within 1..2147483647', () => {
    const pipe = new PositiveIntPipe();
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('2147483647')).toBe(2147483647);

    for (const bad of ['0', '-5', '1.5', '2147483648', '999999999999', 'abc']) {
      expect(() => pipe.transform(bad)).toThrow(BadRequestException);
    }
  });

  it('parses valid coordinates in NearbyCinemasDto and rejects empty strings, out-of-range values, and arrays', async () => {
    const valid = (await validationPipe.transform(
      { lat: '-34.6037', lng: '-58.3816' },
      nearbyMeta,
    )) as NearbyCinemasDto;
    expect(valid.lat).toBeCloseTo(-34.6037);
    expect(valid.lng).toBeCloseTo(-58.3816);

    for (const badQuery of [
      { lat: '', lng: '' },
      { lat: '95', lng: '-58' },
      { lat: '-34', lng: '-190' },
      { lat: ['-34', '-35'], lng: '-58' },
      { lat: 'abc', lng: '-58' },
    ]) {
      await expect(
        validationPipe.transform(badQuery, nearbyMeta),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
