import { PrismaClient } from '@prisma/client';
import { AppService } from '../../src/app.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { client, reset } from './helpers';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reproduce with npm run test:integration -- --testPathPatterns=health-benchmark.
// Counts physical SQL queries. Timings are local evidence, not a production SLO.
describe('R09 reproducible health benchmark', () => {
  it('bounds metric queries for 100 serial or concurrent monitoring probes', async () => {
    const guard = client(); // validate the ephemeral URL before constructing a measured client
    await guard.$disconnect();
    const db = new PrismaClient({
      datasources: { db: { url: process.env.INTEGRATION_DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    let queries = 0;
    db.$on('query', () => queries++);
    const prisma = db as PrismaService;
    try {
      await reset(prisma);
      const chain = await db.cinemaChain.create({
        data: { name: 'Benchmark chain' },
      });
      const location = await db.cinemaLocation.create({
        data: {
          name: 'Benchmark venue',
          address: 'fixture',
          lat: 0,
          lng: 0,
          chainId: chain.id,
        },
      });
      const movie = await db.movie.create({
        data: { title: 'Fixture', normalizedKey: 'benchmark' },
      });
      await db.showtime.createMany({
        data: Array.from({ length: 10000 }, (_, i) => ({
          movieId: movie.id,
          locationId: location.id,
          dateTime: new Date(Date.now() + (i + 1) * 60000),
          format: '2D',
          language: 'SUB',
          ticketUrl: 'https://example.test',
        })),
      });
      // Warm the DB connection, without warming the new service's cache.
      await db.$queryRaw`SELECT 1`;
      const results: {
        mode: string;
        probes: number;
        queries: number;
        elapsedMs: number;
      }[] = [];
      const measure = async (mode: string, work: () => Promise<unknown>) => {
        queries = 0;
        const start = performance.now();
        await work();
        results.push({
          mode,
          probes: 100,
          queries,
          elapsedMs: Math.round(performance.now() - start),
        });
      };
      await measure('before-serial', async () => {
        for (let i = 0; i < 100; i++) {
          await db.$queryRaw`SELECT 1`;
          await db.showtime.count({ where: { dateTime: { gte: new Date() } } });
          await db.showtime.aggregate({
            _max: { dateTime: true },
            where: { dateTime: { gte: new Date() } },
          });
          await db.scrapeRun.findFirst({ orderBy: { completedAt: 'desc' } });
        }
      });
      const serial = new AppService(prisma);
      await measure('after-serial', async () => {
        for (let i = 0; i < 100; i++) await serial.getHealthStatus();
      });
      const parallel = new AppService(prisma);
      await measure('after-concurrent', () =>
        Promise.all(
          Array.from({ length: 100 }, () => parallel.getHealthStatus()),
        ),
      );
      expect(results.map((r) => r.queries)).toEqual([400, 103, 103]);
      const outputDir = resolve(__dirname, '../../.tmp');
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(
        resolve(outputDir, 'health-benchmark.json'),
        JSON.stringify({ showtimes: 10000, results }, null, 2),
      );
      console.log(
        'HEALTH_BENCHMARK',
        JSON.stringify({ showtimes: 10000, results }),
      );
    } finally {
      await db.$disconnect();
    }
  });
});
