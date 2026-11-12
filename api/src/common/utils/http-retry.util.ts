export interface HttpRetryOptions {
  signal?: AbortSignal;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  randomFn?: () => number;
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
  const raw: unknown = Array.isArray(headerValue)
    ? (headerValue as readonly unknown[])[0]
    : headerValue;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return null;
  }

  const text = String(raw).trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    return Number(text) * 1000;
  }

  const parsedDateMs = Date.parse(text);
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
    return Math.min(maxDelayMs, Math.max(baseDelayMs, retryAfterMs));
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
  const sleepFn =
    options.sleepFn ?? ((ms: number) => defaultSleep(ms, options.signal));
  const randomFn = options.randomFn ?? Math.random;

  let attempt = 0;
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
      attempt++;
      await sleepFn(delayMs);
    }
  }
}
