import { Prisma } from '@prisma/client';
import { ScraperLease, WriteFence } from './scraper-lease';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as os from 'os';
import { PrismaService } from '../../prisma/prisma.service';

export const SCRAPER_LOCK_OPTIONS = 'SCRAPER_LOCK_OPTIONS';
export interface ScraperLockOptions {
  heartbeatMs?: number;
  chainRunTimeoutMs?: number;
  globalRunTimeoutMs?: number;
}
export const GLOBAL_SCRAPER_LOCK_KEY = 'scraper:global';
export const DEFAULT_GLOBAL_LOCK_TTL_MS = 25 * 60 * 1000; // 25 minutes
export const DEFAULT_CHAIN_LOCK_TTL_MS = 20 * 60 * 1000; // 20 minutes

export function buildChainLockKey(chainKey: string): string {
  return `scraper:chain:${chainKey.toLowerCase()}`;
}

@Injectable()
export class ScraperLockService {
  private readonly logger = new Logger(ScraperLockService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(SCRAPER_LOCK_OPTIONS)
    private readonly options: ScraperLockOptions = {},
  ) {}

  /**
   * Atomically admits a lease in a short PostgreSQL transaction
   * compatible with Supabase Transaction Pooler (PgBouncer :6543).
   * If a previous runner crashed and its lease expired (`expiresAt < NOW()`),
   * the expired lease is atomically reclaimed.
   *
   * @returns Generated `ownerId` token when acquired, or `null` if currently held.
   */
  async acquire(
    lockKey: string,
    ttlMs: number = DEFAULT_CHAIN_LOCK_TTL_MS,
    parentOwner?: string,
  ): Promise<string | null> {
    const ownerId = `${os.hostname()}-${process.pid}-${randomUUID()}`;

    if (!Number.isFinite(ttlMs) || ttlMs <= 0)
      throw new Error('Lease TTL must be positive');
    const affected = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
        // One short admission gate prevents global-vs-chain check/insert races.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(534843210)`;
        if (lockKey === GLOBAL_SCRAPER_LOCK_KEY) {
          const busy = await tx.$queryRaw<{ lockKey: string }[]>`
          SELECT "lockKey" FROM "ScraperLock"
          WHERE "lockKey" LIKE 'scraper:chain:%' AND "expiresAt" > clock_timestamp() LIMIT 1
        `;
          if (busy.length) return 0;
        } else if (lockKey.startsWith('scraper:chain:')) {
          const busy = await tx.$queryRaw<{ lockKey: string }[]>`
          SELECT "lockKey" FROM "ScraperLock"
          WHERE "lockKey" = 'scraper:global' AND "expiresAt" > clock_timestamp()
            AND "ownerId" IS DISTINCT FROM ${parentOwner ?? null} LIMIT 1
        `;
          if (busy.length) return 0;
          if (parentOwner) {
            const parent = await tx.$queryRaw<{ lockKey: string }[]>`
            SELECT "lockKey" FROM "ScraperLock" WHERE "lockKey" = 'scraper:global'
              AND "ownerId" = ${parentOwner} AND "expiresAt" > clock_timestamp() FOR UPDATE
          `;
            if (!parent.length) return 0;
          }
        }
        const affected = await tx.$executeRaw`
      INSERT INTO "ScraperLock" ("lockKey", "ownerId", "acquiredAt", "expiresAt")
      VALUES (${lockKey}, ${ownerId}, clock_timestamp(), clock_timestamp() + (${ttlMs}::bigint * INTERVAL '1 millisecond'))
      ON CONFLICT ("lockKey") DO UPDATE
        SET "ownerId" = EXCLUDED."ownerId",
            "acquiredAt" = clock_timestamp(),
            "expiresAt" = EXCLUDED."expiresAt"
        WHERE "ScraperLock"."expiresAt" < clock_timestamp()
    `;

        return affected;
      },
      { maxWait: 5000, timeout: 5000 },
    );

    if (affected > 0) {
      return ownerId;
    }

    return null;
  }

  watch(
    lockKey: string,
    ownerId: string,
    ttlMs = DEFAULT_CHAIN_LOCK_TTL_MS,
    parent?: ScraperLease,
  ): ScraperLease {
    const duration =
      lockKey === GLOBAL_SCRAPER_LOCK_KEY
        ? (this.options.globalRunTimeoutMs ?? 12 * 60 * 1000)
        : (this.options.chainRunTimeoutMs ?? 10 * 60 * 1000);
    return new ScraperLease(
      (tx) => this.assertOwned(tx, lockKey, ownerId),
      () => this.renew(lockKey, ownerId, ttlMs, parent?.guard),
      this.options.heartbeatMs ??
        Math.min(30000, Math.max(10, Math.floor(ttlMs / 3))),
      duration,
      parent,
    );
  }

  async renew(
    lockKey: string,
    ownerId: string,
    ttlMs: number,
    parentFence?: WriteFence,
  ): Promise<boolean> {
    const count = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
        // Renewal participates in admission so it cannot revive a chain across a new global run.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(534843210)`;
        if (parentFence) await parentFence(tx);
        else if (lockKey.startsWith('scraper:chain:')) {
          const global = await tx.$queryRaw<{ lockKey: string }[]>`
          SELECT "lockKey" FROM "ScraperLock"
          WHERE "lockKey" = 'scraper:global' AND "expiresAt" > clock_timestamp() LIMIT 1
        `;
          if (global.length) return 0;
        }
        return tx.$executeRaw`
        UPDATE "ScraperLock" SET "expiresAt" = clock_timestamp() + (${ttlMs}::bigint * INTERVAL '1 millisecond')
        WHERE "lockKey" = ${lockKey} AND "ownerId" = ${ownerId} AND "expiresAt" > clock_timestamp()
      `;
      },
      { maxWait: 2000, timeout: 5000 },
    );
    return count === 1;
  }

  async assertOwned(
    tx: Prisma.TransactionClient,
    lockKey: string,
    ownerId: string,
  ): Promise<void> {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '10s'`;
    // Holding this row through COMMIT prevents a successor acquiring the lease mid-write.
    const rows = await tx.$queryRaw<{ lockKey: string }[]>`
      SELECT "lockKey" FROM "ScraperLock"
      WHERE "lockKey" = ${lockKey} AND "ownerId" = ${ownerId} AND "expiresAt" > clock_timestamp()
      FOR UPDATE
    `;
    if (rows.length !== 1)
      throw new ConflictException('Scraping lease expired or was replaced');
  }

  /**
   * Checks whether a non-expired lease currently exists for `lockKey`.
   */
  async isLocked(lockKey: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ lockKey: string }[]>`
      SELECT "lockKey"
      FROM "ScraperLock"
      WHERE "lockKey" = ${lockKey}
        AND "expiresAt" > clock_timestamp()
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
      const deleted = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
          await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
          const deleted = await tx.$executeRaw`
        DELETE FROM "ScraperLock"
        WHERE "lockKey" = ${lockKey}
          AND "ownerId" = ${ownerId}
      `;
          return deleted;
        },
        { maxWait: 2000, timeout: 5000 },
      );
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
