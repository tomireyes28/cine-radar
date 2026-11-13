export const DEFAULT_API_TIMEOUT_MS = 8_000;

export type ApiErrorKind =
  | "misconfigured"
  | "rate_limited"
  | "upstream_http"
  | "timeout"
  | "network"
  | "invalid_json";

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly path: string;

  constructor(
    message: string,
    options: {
      kind: ApiErrorKind;
      path: string;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ApiRequestError";
    this.kind = options.kind;
    this.status = options.status;
    this.path = options.path;
  }
}

export interface ApiRequestOptions {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface UpcomingMovie {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string;
  overview: string;
  isReRelease: boolean;
}

export interface CinemaLocation {
  id: number;
  name: string;
  address: string;
  zone?: string;
  lat: number | null;
  lng: number | null;
  chainId: number;
}

export interface CinemaChain {
  id: number;
  name: string;
  logoUrl?: string | null;
  locations: CinemaLocation[];
}

export interface BillboardFilters {
  zone?: string;
  chainId?: string;
  cinemaId?: string;
  date?: string;
}

/**
 * Performs an HTTP GET against the Cine Radar API:
 * - Returns `null` ONLY on HTTP `404` (allowing routes to invoke `notFound()`).
 * - Preserves genuine `200 []` empty collections.
 * - Throws typed `ApiRequestError` on `429`, `5xx`, network failures, timeouts,
 *   or missing `HTTP base URL` so Next.js `error.tsx` activates and ISR
 *   never caches an outage as empty content.
 */
export async function apiGet<T>(
  path: string,
  params: Record<string, string | undefined>,
  revalidate: number,
  options: ApiRequestOptions = {},
): Promise<T | null> {
  const baseUrl = options.apiBaseUrl?.trim();

  if (!baseUrl) {
    throw new ApiRequestError(
      `HTTP base URL is not configured while requesting ${path}`,
      { kind: "misconfigured", path },
    );
  }

  let url: URL;
  try {
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    url = new URL(`${normalizedBase}${normalizedPath}`);
  } catch (cause: unknown) {
    throw new ApiRequestError(
      `Invalid HTTP base URL while requesting ${path}`,
      { kind: "misconfigured", path, cause },
    );
  }

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new ApiRequestError(
      "API timeout must be a positive, finite timer duration",
      { kind: "misconfigured", path },
    );
  }
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  const abortTimeout = () => {
    const error = new Error(`Request timed out after ${timeoutMs}ms`);
    error.name = "TimeoutError";
    controller.abort(error);
  };
  const timeoutHandle = setTimeout(abortTimeout, timeoutMs);
  const timeoutError = (cause: unknown, status?: number) =>
    new ApiRequestError(`API request timed out after ${timeoutMs}ms: ${path}`, {
      kind: "timeout",
      path,
      status,
      cause,
    });
  try {
    let res: Response;
    try {
      res = await fetchFn(url.toString(), {
        signal: controller.signal,
        next: { revalidate },
      } as RequestInit);
      if (performance.now() >= deadline) abortTimeout();
      controller.signal.throwIfAborted();
    } catch (cause: unknown) {
      if (controller.signal.aborted) throw timeoutError(cause);
      throw new ApiRequestError(`API network request failed: ${path}`, {
        kind: "network",
        path,
        cause,
      });
    }
    // Status errors are handled without parsing their body; do not leave that stream open.
    if (!res.ok) void res.body?.cancel().catch(() => undefined);
    if (res.status === 404) return null;
    if (res.status === 429)
      throw new ApiRequestError(`API rate limit exceeded (429): ${path}`, {
        kind: "rate_limited",
        status: 429,
        path,
      });
    if (!res.ok)
      throw new ApiRequestError(`API upstream HTTP ${res.status} on ${path}`, {
        kind: "upstream_http",
        status: res.status,
        path,
      });
    try {
      const data = (await res.json()) as T;
      // Keep the signal active through body consumption, including ignored/late aborts.
      if (performance.now() >= deadline) abortTimeout();
      controller.signal.throwIfAborted();
      return data;
    } catch (cause: unknown) {
      if (controller.signal.aborted) throw timeoutError(cause, res.status);
      throw new ApiRequestError(
        `API response ${cause instanceof SyntaxError ? "JSON parsing" : "body transfer"} failed: ${path}`,
        {
          kind: cause instanceof SyntaxError ? "invalid_json" : "network",
          status: res.status,
          path,
          cause,
        },
      );
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}
