import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ChainScrapeState } from '@prisma/client';
import {
  HEALTH_CHAIN_KEYS,
  HEALTH_METRICS_TTL_MS,
  SCRAPE_FRESHNESS_MS,
} from './common/health-policy';

export interface HealthScrapeRunSnapshot {
  id: number;
  trigger: string;
  scope: string;
  status: string;
  completedAt: string;
  durationMs: number;
  locationsSucceeded: number;
  locationsFailed: number;
  showtimesInserted: number;
  showtimesUnchanged: number;
  failedChains: string[];
}

export interface HealthReadinessResponse {
  status: 'ok';
  service: 'cine-radar-api';
  timestamp: string;
  database: 'connected';
  billboard: {
    activeFutureShowtimes: number;
    horizonUntil: string | null;
    isStale: boolean;
    freshness: 'fresh' | 'partial' | 'stale' | 'unknown';
    chains: ChainFreshness[];
  };
  lastScrapeRun: HealthScrapeRunSnapshot | null;
  metricsAsOf: string | null;
  metricsStatus: 'ok' | 'unavailable';
}

export interface ChainFreshness {
  chainKey: string;
  freshness: 'fresh' | 'partial' | 'stale' | 'unknown';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastAttemptStatus: string | null;
  ageMs: number | null;
  expectedLocations: number;
  verifiedLocations: number;
  emptyVerifiedLocations: number;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private metrics?: Awaited<ReturnType<AppService['loadMetrics']>>;
  private refresh?: Promise<Awaited<ReturnType<AppService['loadMetrics']>>>;
  private metricsExpiresAt = 0;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  getLivenessStatus() {
    return {
      status: 'ok' as const,
      service: 'cine-radar-api' as const,
      timestamp: new Date().toISOString(),
    };
  }

  async getHealthStatus(): Promise<HealthReadinessResponse> {
    const now = new Date();
    try {
      if (!this.prisma) throw new Error('Database client unavailable');
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'cine-radar-api',
        timestamp: now.toISOString(),
        database: 'unreachable',
      });
    }

    // Single-flight refresh also coalesces failures for the TTL. Readiness always
    // performs its own ping, so a cached snapshot cannot hide a database outage.
    if (!this.metrics || performance.now() >= this.metricsExpiresAt) {
      this.refresh ??= this.loadMetrics()
        .then((metrics) => {
          this.metrics = metrics;
          this.metricsExpiresAt = performance.now() + HEALTH_METRICS_TTL_MS;
          return metrics;
        })
        .finally(() => {
          this.refresh = undefined;
        });
      await this.refresh;
    }
    const metrics = this.metrics!;
    const chains = HEALTH_CHAIN_KEYS.map((chainKey) => {
      const state = metrics.states.find((s) => s.chainKey === chainKey);
      const ageMs = state?.lastSuccessAt
        ? Math.max(0, Date.now() - state.lastSuccessAt.getTime())
        : null;
      let freshness: ChainFreshness['freshness'] = 'unknown';
      if (state) {
        freshness =
          ageMs === null || ageMs >= SCRAPE_FRESHNESS_MS
            ? 'stale'
            : state.status === 'complete' || state.status === 'empty_verified'
              ? 'fresh'
              : 'partial';
      }
      return {
        chainKey,
        freshness,
        lastAttemptAt: state?.lastAttemptAt.toISOString() ?? null,
        lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
        lastAttemptStatus: state?.status ?? null,
        ageMs,
        expectedLocations: state?.expectedLocations ?? 0,
        verifiedLocations: state?.verifiedLocations ?? 0,
        emptyVerifiedLocations: state?.emptyVerifiedLocations ?? 0,
      };
    });
    const freshness = chains.every((c) => c.freshness === 'fresh')
      ? 'fresh'
      : chains.every((c) => c.freshness === 'unknown')
        ? 'unknown'
        : chains.some((c) => ['fresh', 'partial'].includes(c.freshness))
          ? 'partial'
          : 'stale';
    return {
      status: 'ok',
      service: 'cine-radar-api',
      timestamp: now.toISOString(),
      database: 'connected',
      billboard: {
        activeFutureShowtimes: metrics.activeFutureShowtimes,
        horizonUntil: metrics.horizonUntil,
        isStale: freshness !== 'fresh',
        freshness,
        chains,
      },
      lastScrapeRun: metrics.lastScrapeRun,
      metricsAsOf: metrics.asOf,
      metricsStatus: metrics.status,
    };
  }

  private async loadMetrics() {
    try {
      const [agg, states, latestRun] = await Promise.all([
        this.prisma!.showtime.aggregate({
          _count: { _all: true },
          _max: { dateTime: true },
          where: { dateTime: { gte: new Date() } },
        }),
        this.prisma!.chainScrapeState.findMany({
          where: { chainKey: { in: [...HEALTH_CHAIN_KEYS] } },
        }),
        this.prisma!.scrapeRun.findFirst({
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            trigger: true,
            scope: true,
            status: true,
            completedAt: true,
            durationMs: true,
            locationsSucceeded: true,
            locationsFailed: true,
            showtimesInserted: true,
            showtimesUnchanged: true,
            failedChains: true,
          },
        }),
      ]);
      return {
        status: 'ok' as const,
        asOf: new Date().toISOString(),
        activeFutureShowtimes: agg._count._all,
        horizonUntil: agg._max.dateTime?.toISOString() ?? null,
        states,
        lastScrapeRun: latestRun
          ? { ...latestRun, completedAt: latestRun.completedAt.toISOString() }
          : null,
      };
    } catch {
      this.logger.warn(
        'Health data metrics unavailable; database ping succeeded',
      );
      return {
        status: 'unavailable' as const,
        asOf: null,
        activeFutureShowtimes: 0,
        horizonUntil: null,
        states: [] as ChainScrapeState[],
        lastScrapeRun: null,
      };
    }
  }
}
