import { Prisma } from '@prisma/client';
import { ScraperLease } from './scraper-lease';
import { withHttpRetry } from '../../common/utils/http-retry.util';

describe('R05 lease lifecycle and cancellation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  it('aborts active work when renewal reports lost ownership and stops its timers', async () => {
    const renew = jest.fn().mockResolvedValue(false);
    const owned = jest.fn().mockResolvedValue(undefined);
    const lease = new ScraperLease(owned, renew, 10, 1000);
    const failed = expect(
      lease.run(() => new Promise<never>(() => undefined)),
    ).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(10);
    await failed;
    expect(lease.signal.aborted).toBe(true);
    await expect(lease.guard({} as Prisma.TransactionClient)).rejects.toThrow();
    expect(owned).not.toHaveBeenCalled();
    await lease.close();
    await jest.advanceTimersByTimeAsync(2000);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('checks wall-clock deadline even when a suspended event loop has not delivered the timer', async () => {
    const owned = jest.fn().mockResolvedValue(undefined);
    const lease = new ScraperLease(
      owned,
      () => Promise.resolve(true),
      100,
      1000,
    );
    jest.setSystemTime(Date.now() + 1001);
    await expect(lease.guard({} as Prisma.TransactionClient)).rejects.toThrow();
    expect(owned).not.toHaveBeenCalled();
    await lease.close();
  });
  it('does not renew or write again after closure', async () => {
    const renew = jest.fn().mockResolvedValue(true);
    const lease = new ScraperLease(() => Promise.resolve(), renew, 10, 1000);
    await lease.close();
    await jest.advanceTimersByTimeAsync(100);
    expect(renew).not.toHaveBeenCalled();
    expect(() => lease.assertActive()).toThrow();
  });
  it('cancels retry backoff and never issues another request after an abort', async () => {
    const controller = new AbortController();
    const operation = jest.fn().mockRejectedValue({ code: 'ECONNRESET' });
    const running = withHttpRetry(operation, {
      signal: controller.signal,
      maxRetries: 2,
      baseDelayMs: 1000,
    });
    const failed = expect(running).rejects.toThrow('cancelled');
    await jest.advanceTimersByTimeAsync(1);
    controller.abort(new Error('cancelled'));
    await failed;
    await jest.advanceTimersByTimeAsync(5000);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('still aborts on connection errors instead of treating them as contention', async () => {
    const lease = new ScraperLease(
      () => Promise.resolve(),
      () => Promise.reject(new Error('database unavailable')),
      10,
      1000,
    );
    await jest.advanceTimersByTimeAsync(10);
    expect(lease.signal.aborted).toBe(true);
    await lease.close();
  });

  it('does not extend the execution deadline when lock contention persists', async () => {
    const contention = new Prisma.PrismaClientKnownRequestError(
      'lock timeout',
      {
        code: 'P2010',
        clientVersion: 'test',
        meta: { code: '55P03' },
      },
    );
    const renew = jest.fn().mockRejectedValue(contention);
    const lease = new ScraperLease(() => Promise.resolve(), renew, 10, 50);
    const failed = expect(
      lease.run(() => new Promise<never>(() => undefined)),
    ).rejects.toThrow('deadline');
    await jest.advanceTimersByTimeAsync(49);
    expect(lease.signal.aborted).toBe(false);
    expect(renew).toHaveBeenCalledTimes(4);
    await jest.advanceTimersByTimeAsync(1);
    await failed;
    await lease.close();
  });
});
