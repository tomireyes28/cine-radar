export interface HttpRetryOptions {
  signal?: AbortSignal;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Cumulative sleep budget, independent of the backoff cap. Defaults to maxDelayMs. */
  maxTotalDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  randomFn?: () => number;
}

export class HttpRetryDeferredError extends Error {
  constructor(
    readonly requiredDelayMs: number,
    readonly remainingDelayMs: number,
    cause: unknown,
  ) {
    super(
      `HTTP retry deferred: required delay ${requiredDelayMs}ms exceeds remaining wait budget ${remainingDelayMs}ms`,
      { cause },
    );
    this.name = 'HttpRetryDeferredError';
  }
}

interface HttpErrorLike {
  code?: unknown;
  response?: {
    status?: unknown;
    headers?: Record<string, unknown>;
  };
}

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ERR_NETWORK',
]);

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      const reason: unknown = signal?.reason;
      reject(reason instanceof Error ? reason : new Error('Request aborted'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/**
 * Parses HTTP `Retry-After` header (either integer delay-seconds or RFC 7231 HTTP-date).
 */
export function parseRetryAfterMs(
  headerValue: unknown,
  nowMs: number = Date.now(),
): number | null {
  if (Array.isArray(headerValue)) {
    const values = (headerValue as unknown[])
      .map((value) => parseRetryAfterMs(value, nowMs))
      .filter((value): value is number => value !== null);
    return values.length ? Math.max(...values) : null;
  }
  const raw = headerValue;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return null;
  }

  const text = String(raw).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    return Number(text) * 1000;
  }

  // Reject Date.parse's permissive numeric/ISO inputs; HTTP-date has three specified forms.
  const fixed =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
  const legacy =
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/;
  const asctime =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} ( \d|\d{2}) \d{2}:\d{2}:\d{2} \d{4}$/;
  let date = text;
  const old = legacy.exec(text);
  if (old) {
    const currentYear = new Date(nowMs).getUTCFullYear();
    let year = Math.floor(currentYear / 100) * 100 + Number(old[4]);
    if (year > currentYear + 50) year -= 100;
    if (year < currentYear - 49) year += 100;
    date = `${old[2]} ${old[3]} ${year} ${old[5]} GMT`;
  } else if (asctime.test(text)) {
    date = `${text} GMT`; // asctime is UTC, never the execution host's timezone.
  } else if (!fixed.test(text)) {
    return null;
  }
  // HTTP-date permits a leap second; Date.parse does not. Round it forward, never earlier.
  const leapSecond = /:60(?= (?:GMT|\d{4} GMT)$)/.test(date);
  const parsedDateMs =
    Date.parse(
      leapSecond ? date.replace(/:60(?= (?:GMT|\d{4} GMT)$)/, ':59') : date,
    ) + (leapSecond ? 1000 : 0);
  if (!Number.isNaN(parsedDateMs)) {
    return Math.max(0, parsedDateMs - nowMs);
  }

  return null;
}

/**
 * Returns true ONLY for transient transport failures or upstream 429/5xx responses.
 * Never retries 400/401/403/404/422 or local schema/contract validation errors.
 */
export function isRetryableHttpError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as HttpErrorLike;
  const status = candidate.response?.status;
  if (typeof status === 'number') {
    return RETRYABLE_HTTP_STATUSES.has(status);
  }

  const code = candidate.code;
  if (typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code)) {
    return true;
  }

  return false;
}

function computeRetryDelayMs(
  error: unknown,
  attemptIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
  randomFn: () => number,
): number {
  const headers = (error as HttpErrorLike | null)?.response?.headers;
  const retryAfterHeader = headers?.['retry-after'] ?? headers?.['Retry-After'];
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);

  if (retryAfterMs !== null) {
    // The server's minimum must never be shortened by our exponential-backoff cap.
    return Math.max(baseDelayMs, retryAfterMs);
  }

  const exponential = baseDelayMs * 2 ** attemptIndex;
  const jitterMultiplier = 0.75 + randomFn() * 0.5; // [0.75x .. 1.25x]
  return Math.min(maxDelayMs, Math.round(exponential * jitterMultiplier));
}

/**
 * Executes an async HTTP request with bounded retries, exponential backoff + jitter,
 * and `Retry-After` compliance. Defaults `maxRetries` to `0` under `NODE_ENV === 'test'`
 * unless explicitly specified so unit suites with fake timers remain instant and deterministic.
 */
export async function withHttpRetry<T>(
  operation: () => Promise<T>,
  options: HttpRetryOptions = {},
): Promise<T> {
  const defaultRetries = process.env.NODE_ENV === 'test' ? 0 : 2;
  const maxRetries = options.maxRetries ?? defaultRetries;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const maxTotalDelayMs = options.maxTotalDelayMs ?? maxDelayMs;
  if (
    !Number.isInteger(maxRetries) ||
    maxRetries < 0 ||
    ![baseDelayMs, maxDelayMs, maxTotalDelayMs].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 2_147_483_647,
    )
  ) {
    throw new RangeError(
      'HTTP retry limits must be finite, non-negative timer durations and an integer retry count',
    );
  }
  const sleepFn =
    options.sleepFn ?? ((ms: number) => defaultSleep(ms, options.signal));
  const randomFn = options.randomFn ?? Math.random;

  let attempt = 0;
  let totalDelayMs = 0;
  while (true) {
    options.signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error: unknown) {
      options.signal?.throwIfAborted();
      if (attempt >= maxRetries || !isRetryableHttpError(error)) {
        throw error;
      }

      const delayMs = computeRetryDelayMs(
        error,
        attempt,
        baseDelayMs,
        maxDelayMs,
        randomFn,
      );
      const remainingDelayMs = maxTotalDelayMs - totalDelayMs;
      if (!Number.isFinite(delayMs) || delayMs > remainingDelayMs) {
        throw new HttpRetryDeferredError(delayMs, remainingDelayMs, error);
      }
      attempt++;
      totalDelayMs += delayMs;
      await sleepFn(delayMs);
    }
  }
}
