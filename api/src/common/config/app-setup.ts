import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { buildCorsOptions } from './cors.config';

export type TrustProxySetting = boolean | number | string;

/**
 * Resolves Express `trust proxy` setting so `@nestjs/throttler` reads real client IPs
 * behind Railway/Vercel reverse proxies instead of rate-limiting every user under one proxy IP,
 * while remaining disabled on direct unproxied local/test connections by default.
 */
export function resolveTrustProxySetting(
  trustProxyEnv = process.env.TRUST_PROXY,
  nodeEnv = process.env.NODE_ENV,
): TrustProxySetting {
  const trimmed = trustProxyEnv?.trim();
  if (!trimmed) {
    return nodeEnv === 'production' ? 1 : false;
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'false' || lower === '0') {
    return false;
  }
  if (lower === 'true') {
    return true;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

export function configureHttpApp(
  app: INestApplication,
  frontendUrlEnv = process.env.FRONTEND_URL,
  trustProxyEnv = process.env.TRUST_PROXY,
): void {
  const httpInstance = app.getHttpAdapter()?.getInstance?.() as
    | { set?: (setting: string, value: unknown) => void }
    | undefined;
  if (typeof httpInstance?.set === 'function') {
    httpInstance.set('trust proxy', resolveTrustProxySetting(trustProxyEnv));
  }

  // Configure Helmet with contentSecurityPolicy relaxed for Swagger UI assets
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors(buildCorsOptions(frontendUrlEnv));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
