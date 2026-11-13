import { Prisma } from '@prisma/client';
import {
  SCRAPE_RUN_PRUNE_BATCH,
  SCRAPE_RUN_RETENTION_MS,
} from '../../common/health-policy';
import type { OrchestratorChainSummary } from './scraper-orchestrator.service';

export async function checkpointChains(
  tx: Prisma.TransactionClient,
  chains: OrchestratorChainSummary[],
  completedAt: Date,
): Promise<void> {
  // Sorted keys avoid opposite lock order between concurrent telemetry writers.
  for (const chain of [...chains].sort((a, b) =>
    a.chainKey.localeCompare(b.chainKey),
  )) {
    const verified = chain.locationsComplete + chain.locationsEmptyVerified;
    const succeeded =
      ['complete', 'empty_verified'].includes(chain.status) &&
      chain.expectedLocations > 0 &&
      verified === chain.expectedLocations &&
      chain.locationsFailed === 0 &&
      chain.locationsPartial === 0;
    const successAt = succeeded ? completedAt : null;
    const status =
      !succeeded && ['complete', 'empty_verified'].includes(chain.status)
        ? 'partial'
        : chain.status;
    await tx.$executeRaw`
      INSERT INTO "ChainScrapeState"
        ("chainKey", "lastAttemptAt", "lastSuccessAt", "status",
         "expectedLocations", "verifiedLocations", "emptyVerifiedLocations")
      VALUES (${chain.chainKey}, ${completedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC',
        ${successAt?.toISOString() ?? null}::timestamptz AT TIME ZONE 'UTC', ${status},
        ${chain.expectedLocations}, ${verified}, ${chain.locationsEmptyVerified})
      ON CONFLICT ("chainKey") DO UPDATE SET
        "lastAttemptAt" = EXCLUDED."lastAttemptAt",
        "lastSuccessAt" = COALESCE(EXCLUDED."lastSuccessAt", "ChainScrapeState"."lastSuccessAt"),
        "status" = EXCLUDED."status",
        "expectedLocations" = EXCLUDED."expectedLocations",
        "verifiedLocations" = EXCLUDED."verifiedLocations",
        "emptyVerifiedLocations" = EXCLUDED."emptyVerifiedLocations"
      WHERE "ChainScrapeState"."lastAttemptAt" <= EXCLUDED."lastAttemptAt"
    `;
  }
}

export async function pruneScrapeRuns(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<void> {
  // A batch bounds lock duration and work; old backlogs drain over later runs.
  const expired = await tx.scrapeRun.findMany({
    where: {
      completedAt: { lt: new Date(now.getTime() - SCRAPE_RUN_RETENTION_MS) },
    },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
    take: SCRAPE_RUN_PRUNE_BATCH,
    select: { id: true },
  });
  if (expired.length) {
    await tx.scrapeRun.deleteMany({
      where: { id: { in: expired.map((run) => run.id) } },
    });
  }
}
