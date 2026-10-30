import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  const originalEnv = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    guard = new ApiKeyGuard();
    process.env.ADMIN_API_KEY = 'test-secret-admin-key';
  });

  afterAll(() => {
    process.env.ADMIN_API_KEY = originalEnv;
  });

  function createMockContext(apiKeyHeader?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: apiKeyHeader ? { 'x-api-key': apiKeyHeader } : {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when x-api-key matches ADMIN_API_KEY', () => {
    const ctx = createMockContext('test-secret-admin-key');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws UnauthorizedException when x-api-key is missing', () => {
    const ctx = createMockContext();
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when x-api-key is invalid', () => {
    const ctx = createMockContext('wrong-key');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
