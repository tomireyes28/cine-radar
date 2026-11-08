import { buildCorsOptions, getAllowedCorsOrigins } from './cors.config';

type OriginCallback = (err: Error | null, allow?: boolean) => void;
type OriginFn = (
  requestOrigin: string | undefined,
  callback: OriginCallback,
) => void;

function evaluateOrigin(corsOrigin: OriginFn, origin?: string): boolean {
  let allowed = false;
  corsOrigin(origin, (err, allow) => {
    if (err) throw err;
    allowed = Boolean(allow);
  });
  return allowed;
}

describe('CORS Configuration (F13)', () => {
  it('builds exact allowlist from defaults and FRONTEND_URL', () => {
    const origins = getAllowedCorsOrigins(
      'https://cineradar.ar/, https://staging.cineradar.ar , invalid-url',
    );

    expect(origins.has('https://cinema-agenda-app.vercel.app')).toBe(true);
    expect(origins.has('http://localhost:3000')).toBe(true);
    expect(origins.has('http://localhost:3001')).toBe(true);
    expect(origins.has('https://cineradar.ar')).toBe(true);
    expect(origins.has('https://staging.cineradar.ar')).toBe(true);
    expect(origins.has('invalid-url')).toBe(false);
  });

  it('disables credentials and allows server-to-server calls without Origin header', () => {
    const options = buildCorsOptions('');
    expect(options.credentials).toBe(false);

    const originFn = options.origin as OriginFn;
    expect(evaluateOrigin(originFn, undefined)).toBe(true);
  });

  it('allows exact configured origins and rejects arbitrary *.vercel.app domains', () => {
    const options = buildCorsOptions('https://custom.example.com');
    const originFn = options.origin as OriginFn;

    expect(
      evaluateOrigin(originFn, 'https://cinema-agenda-app.vercel.app'),
    ).toBe(true);
    expect(evaluateOrigin(originFn, 'https://custom.example.com')).toBe(true);

    // Previously accepted due to .endsWith('.vercel.app')
    expect(evaluateOrigin(originFn, 'https://evil-third-party.vercel.app')).toBe(
      false,
    );
    expect(
      evaluateOrigin(
        originFn,
        'https://cinema-agenda-app-forked-attacker.vercel.app',
      ),
    ).toBe(false);
    expect(
      evaluateOrigin(
        originFn,
        'https://cinema-agenda-app.vercel.app.attacker.com',
      ),
    ).toBe(false);
  });
});
