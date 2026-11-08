import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureHttpApp } from '../src/common/config/app-setup';

describe('AppController & Bootstrap HTTP (e2e)', () => {
  let app: INestApplication<App>;

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.DISABLE_INTERNAL_CRON = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureHttpApp(app, 'https://cinema-agenda-app.vercel.app');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns service status JSON', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    const body = res.body as {
      status: string;
      service: string;
      timestamp: string;
    };

    expect(body.status).toBe('ok');
    expect(body.service).toBe('cine-radar-api');
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /health returns 200 status payload', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as { status: string };
    expect(body.status).toBe('ok');
  });

  it('enforces exact CORS origins and omits credentials header', async () => {
    const allowedRes = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://cinema-agenda-app.vercel.app')
      .expect(200);

    expect(allowedRes.headers['access-control-allow-origin']).toBe(
      'https://cinema-agenda-app.vercel.app',
    );
    expect(allowedRes.headers['access-control-allow-credentials']).toBeUndefined();

    const rejectedRes = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://untrusted-third-party.vercel.app')
      .expect(200);

    expect(
      rejectedRes.headers['access-control-allow-origin'],
    ).toBeUndefined();
  });
});
