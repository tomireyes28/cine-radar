import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TmdbService } from '../../tmdb/tmdb.service';
import { MovieIdentityService } from './movie-identity.service';
import { TitleNormalizerService } from './title-normalizer.service';

describe('R04 bounded identity conflict retries', () => {
  function setup() {
    const transaction = jest.fn();
    const lookup = jest.fn().mockResolvedValue({ status: 'not_found' });
    const db = {
      movie: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: transaction,
    };
    const service = new MovieIdentityService(
      db as unknown as PrismaService,
      { lookupMovie: lookup } as unknown as TmdbService,
      new TitleNormalizerService(),
    );
    return { transaction, lookup, service };
  }
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2002',
      clientVersion: 'test',
    });
  it('rereads in a new transaction while fetching external metadata only once', async () => {
    const { transaction, lookup, service } = setup();
    transaction
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue({ id: 1 });
    expect(await service.resolveAndUpsertMovie('Film', new Map())).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it('does not loop indefinitely when a conflict cannot be resolved', async () => {
    const { transaction, service } = setup();
    const error = conflict();
    transaction.mockRejectedValue(error);
    await expect(service.resolveAndUpsertMovie('Film', new Map())).rejects.toBe(
      error,
    );
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it('propagates non-concurrency failures without retrying', async () => {
    const { transaction, service } = setup();
    const error = new Error('database unavailable');
    transaction.mockRejectedValue(error);
    await expect(service.resolveAndUpsertMovie('Film', new Map())).rejects.toBe(
      error,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
