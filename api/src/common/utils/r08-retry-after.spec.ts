import {
  HttpRetryDeferredError,
  parseRetryAfterMs,
  withHttpRetry,
} from './http-retry.util';

const limited = (value: unknown) =>
  Object.assign(new Error('provider limited'), {
    response: { status: 429, headers: { 'retry-after': value } },
  });

describe('R08 Retry-After minimum and bounded waiting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-13T11:59:58Z'));
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it.each(['2', 2, '0002', ['1', '2']])('parses delay seconds %j', (value) => {
    expect(parseRetryAfterMs(value)).toBe(2000);
  });
  it.each([
    'Fri, 13 Nov 2026 12:00:00 GMT',
    'Friday, 13-Nov-26 12:00:00 GMT',
    'Fri Nov 13 12:00:00 2026',
  ])('interprets HTTP-date as UTC: %s', (value) => {
    expect(parseRetryAfterMs(value)).toBe(2000);
  });
  it('handles the moving 50-year boundary of two-digit HTTP years', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfterMs('Friday, 01-Jan-76 00:00:00 GMT', now)).toBe(
      Date.parse('2076-01-01T00:00:00Z') - now,
    );
  });
  it.each([
    'Tue, 30 Jun 2026 23:59:60 GMT',
    'Tuesday, 30-Jun-26 23:59:60 GMT',
    'Tue Jun 30 23:59:60 2026',
  ])(
    'does not turn a leap-second HTTP-date into an early backoff: %s',
    (value) => {
      expect(parseRetryAfterMs(value, Date.parse('2026-06-30T23:59:58Z'))).toBe(
        2000,
      );
    },
  );
  it.each([
    '-1',
    '1.5',
    '-2.5',
    '2026-11-13T12:00:00Z',
    'nonsense',
    '',
    null,
    {},
    -1,
  ])('ignores malformed Retry-After %j', (value) => {
    expect(parseRetryAfterMs(value)).toBeNull();
  });
  it('never sends a follow-up before the indicated delay has elapsed', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(limited('1'))
      .mockResolvedValue('ok');
    const result = withHttpRetry(request, { maxRetries: 1 });
    await jest.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('defers a 120-second minimum instead of clamping it to 8 seconds', async () => {
    const original = limited('120');
    const request = jest.fn().mockRejectedValue(original);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(
      withHttpRetry(request, { maxRetries: 1, sleepFn: sleep }),
    ).rejects.toMatchObject({
      name: 'HttpRetryDeferredError',
      cause: original,
      requiredDelayMs: 120000,
      remainingDelayMs: 8000,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
  it('permits a server delay above the backoff cap when an explicit wait budget allows it', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(limited('2'))
      .mockResolvedValue('ok');
    const sleep = jest.fn().mockResolvedValue(undefined);
    expect(
      await withHttpRetry(request, {
        maxRetries: 1,
        maxDelayMs: 1000,
        maxTotalDelayMs: 5000,
        sleepFn: sleep,
      }),
    ).toBe('ok');
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it('accounts for previous waits before deciding whether another retry fits', async () => {
    const request = jest.fn().mockRejectedValue(limited('2'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(
      withHttpRetry(request, {
        maxRetries: 3,
        maxTotalDelayMs: 3000,
        sleepFn: sleep,
      }),
    ).rejects.toMatchObject({
      requiredDelayMs: 2000,
      remainingDelayMs: 1000,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it('does not pass an overflowing numeric header to setTimeout', async () => {
    const request = jest.fn().mockRejectedValue(limited('9'.repeat(400)));
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(
      withHttpRetry(request, { maxRetries: 1, sleepFn: sleep }),
    ).rejects.toBeInstanceOf(HttpRetryDeferredError);
    expect(sleep).not.toHaveBeenCalled();
  });
  it('uses backoff for invalid headers and preserves the original error if retries are disabled', async () => {
    const original = limited('bad');
    const sleep = jest.fn().mockResolvedValue(undefined);
    const request = jest
      .fn()
      .mockRejectedValueOnce(original)
      .mockResolvedValue('ok');
    expect(
      await withHttpRetry(request, {
        maxRetries: 1,
        randomFn: () => 0.5,
        sleepFn: sleep,
      }),
    ).toBe('ok');
    expect(sleep).toHaveBeenCalledWith(400);
    await expect(
      withHttpRetry(() => Promise.reject(original), { maxRetries: 0 }),
    ).rejects.toBe(original);
  });
  it('cancels the server-directed wait without issuing another request', async () => {
    const controller = new AbortController();
    const request = jest.fn().mockRejectedValue(limited('2'));
    const result = withHttpRetry(request, {
      maxRetries: 1,
      signal: controller.signal,
    });
    const failed = expect(result).rejects.toThrow('stopped');
    await jest.advanceTimersByTimeAsync(100);
    controller.abort(new Error('stopped'));
    await failed;
    await jest.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
