import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://cinema-agenda-app.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getAllowedCorsOrigins(frontendUrlEnv?: string): Set<string> {
  const configured = (frontendUrlEnv ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter((origin): origin is string => origin !== null);

  return new Set<string>([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function buildCorsOptions(frontendUrlEnv?: string): CorsOptions {
  const allowedOrigins = getAllowedCorsOrigins(frontendUrlEnv);

  return {
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow server-to-server requests (SSR fetches, CLI, health checks) without Origin header
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      const normalized = normalizeOrigin(requestOrigin);
      if (normalized && allowedOrigins.has(normalized)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    credentials: false,
  };
}
