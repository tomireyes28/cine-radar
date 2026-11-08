import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as os from 'os';
import { PrismaService } from '../../prisma/prisma.service';

export const GLOBAL_SCRAPER_LOCK_KEY = 'scraper:global';
export const DEFAULT_GLOBAL_LOCK_TTL_MS = 25 * 60 * 1000; // 25 minutes
export const DEFAULT_CHAIN_LOCK_TTL_MS = 20 * 60 * 1000; // 20 minutes

export function buildChainLockKey(chainKey: string): string {
  return `scraper:chain:${chainKey.toLowerCase()}`;
}

@Injectable()
export class ScraperLockService {
  private readonly logger = new Logger(ScraperLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically acquires a lease lock in PostgreSQL using a single statement
   * compatible with Supabase Transaction Pooler (PgBouncer :6543).
   * If a previous runner crashed and its lease expired (`expiresAt < NOW()`),
   * the expired lease is atomically reclaimed.
   *
   * @returns Generated `ownerId` token when acquired, or `null` if currently held.
   */
  async acquire(
    lockKey: string,
    ttlMs: number = DEFAULT_CHAIN_LOCK_TTL_MS,
  ): Promise<string | null> {
    const ownerId = `${os.hostname()}-${process.pid}-${randomUUID()}`;

    const affected = await this.prisma.$executeRaw`
      INSERT INTO "ScraperLock" ("lockKey", "ownerId", "acquiredAt", "expiresAt")
      VALUES (${lockKey}, ${ownerId}, NOW(), NOW() + (${ttlMs}::bigint * INTERVAL '1 millisecond'))
      ON CONFLICT ("lockKey") DO UPDATE
        SET "ownerId" = EXCLUDED."ownerId",
            "acquiredAt" = NOW(),
            "expiresAt" = EXCLUDED."expiresAt"
        WHERE "ScraperLock"."expiresAt" < NOW()
    `;

    if (affected > 0) {
      return ownerId;
    }

    return null;
  }

  /**
   * Checks whether a non-expired lease currently exists for `lockKey`.
   */
  async isLocked(lockKey: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ lockKey: string }[]>`
      SELECT "lockKey"
      FROM "ScraperLock"
      WHERE "lockKey" = ${lockKey}
        AND "expiresAt" >= NOW()
      LIMIT 1
    `;
    return rows.length > 0;
  }

  /**
   * Releases a lease only if still owned by `ownerId` (prevents deleting a lease
   * legitimately reclaimed after expiration).
   */
  async release(lockKey: string, ownerId: string): Promise<boolean> {
    try {
      const deleted = await this.prisma.$executeRaw`
        DELETE FROM "ScraperLock"
        WHERE "lockKey" = ${lockKey}
          AND "ownerId" = ${ownerId}
      `;
      return deleted > 0;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo liberar el bloqueo "${lockKey}" (owner=${ownerId}): ${msg}`,
      );
      return false;
    }
  }
}
