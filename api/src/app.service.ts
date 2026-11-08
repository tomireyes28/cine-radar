import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

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
  };
  lastScrapeRun: HealthScrapeRunSnapshot | null;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

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

    const maybeQueryRaw = (this.prisma as { $queryRaw?: unknown } | undefined)
      ?.$queryRaw;
    if (this.prisma && typeof maybeQueryRaw === 'function') {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Health check DB ping failed: ${msg}`);
        throw new ServiceUnavailableException({
          status: 'error',
          service: 'cine-radar-api',
          timestamp: now.toISOString(),
          database: 'unreachable',
        });
      }
    }

    let activeFutureShowtimes = 0;
    let horizonUntil: string | null = null;
    let lastScrapeRun: HealthScrapeRunSnapshot | null = null;

    const maybeCountShowtimes = (
      this.prisma?.showtime as { count?: unknown } | undefined
    )?.count;
    if (this.prisma && typeof maybeCountShowtimes === 'function') {
      activeFutureShowtimes = await this.prisma.showtime.count({
        where: { dateTime: { gte: now } },
      });
    }

    const maybeAggregateShowtimes = (
      this.prisma?.showtime as { aggregate?: unknown } | undefined
    )?.aggregate;
    if (this.prisma && typeof maybeAggregateShowtimes === 'function') {
      const agg = await this.prisma.showtime.aggregate({
        _max: { dateTime: true },
        where: { dateTime: { gte: now } },
      });
      horizonUntil = agg._max.dateTime ? agg._max.dateTime.toISOString() : null;
    }

    const maybeFindScrapeRun = (
      this.prisma as { scrapeRun?: { findFirst?: unknown } } | undefined
    )?.scrapeRun?.findFirst;
    if (this.prisma && typeof maybeFindScrapeRun === 'function') {
      const latestRun = await this.prisma.scrapeRun.findFirst({
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
      });
      if (latestRun) {
        lastScrapeRun = {
          ...latestRun,
          completedAt: latestRun.completedAt.toISOString(),
        };
      }
    }

    return {
      status: 'ok',
      service: 'cine-radar-api',
      timestamp: now.toISOString(),
      database: 'connected',
      billboard: {
        activeFutureShowtimes,
        horizonUntil,
        isStale: activeFutureShowtimes === 0,
      },
      lastScrapeRun,
    };
  }
}
