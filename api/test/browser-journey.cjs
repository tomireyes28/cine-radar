// Real Chromium + Next.js, with real temporary PostgreSQL and a TMDB fixture. No configured database,
// live TMDB or cinema provider is contacted. Run from api/: npm run test:browser.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');

async function main() {
  const { default: puppeteer } = await import('puppeteer');
  const origin = 'http://127.0.0.1:33440';
  const apiOrigin = 'http://127.0.0.1:33441';
  const requests = [];
  const errors = [];
  const movie = {
    id: 1,
    title: 'Película de prueba',
    tmdbId: null,
    posterUrl: null,
    genres: ['Drama'],
    overview: 'Sinopsis controlada.',
    cinemaCount: 1,
  };
  const databaseUrl = new URL(
    process.env.INTEGRATION_DATABASE_URL || 'invalid:',
  );
  if (
    !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
    !/^\/cine_radar_test_[a-f0-9]{32}$/.test(databaseUrl.pathname)
  )
    throw new Error('Use ephemeral --web --browser runner');
  const { PrismaClient } = require('@prisma/client');
  const admin = new PrismaClient({
    datasources: { db: { url: databaseUrl.toString() } },
  });
  const readerRole = decodeURIComponent(
    new URL(process.env.SUPABASE_DATABASE_URL).username,
  );
  if (!/^cine_radar_web_[a-f0-9]+$/.test(readerRole))
    throw new Error('Expected test-only reader role');
  const api = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    if (new URL(req.url, apiOrigin).pathname !== '/movie/upcoming') {
      res.writeHead(404).end('{}');
      return;
    }
    res.end(
      JSON.stringify({
        results: [
          {
            id: 1,
            title: movie.title,
            poster_path: null,
            release_date: '2099-01-01',
            overview: movie.overview,
          },
        ],
      }),
    );
  });
  let next;
  let browser;
  let serverLog = '';
  const artifactDir = path.join(__dirname, '../.tmp/browser-journey');
  fs.mkdirSync(artifactDir, { recursive: true });
  try {
    api.listen(33441, '127.0.0.1');
    await once(api, 'listening');
    const web = path.resolve(__dirname, '../../web');
    next = spawn(
      process.execPath,
      [
        path.join(web, 'node_modules/next/dist/bin/next'),
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        '33440',
      ],
      {
        cwd: web,
        windowsHide: true,
        env: {
          ...process.env,
          TMDB_FIXTURE_URL: apiOrigin,
          TMDB_API_KEY: 'fixture-server-only-tmdb-key',
          NEXT_PUBLIC_SITE_URL: origin,
          NEXT_TELEMETRY_DISABLED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    next.on('error', (error) => {
      serverLog += error.message;
    });
    next.stdout.on('data', (data) => {
      serverLog += data;
    });
    next.stderr.on('data', (data) => {
      serverLog += data;
    });
    const start = Date.now();
    while (true) {
      if (next.exitCode !== null)
        throw new Error('Next exited before readiness');
      if (Date.now() - start > 90000) throw new Error('Next readiness timeout');
      try {
        const response = await fetch(origin, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) break;
      } catch {
        /* retry only the owned local server */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    });
    const page = await browser.newPage();
    const secrets = [
      decodeURIComponent(new URL(process.env.SUPABASE_DATABASE_URL).password),
      'fixture-server-only-tmdb-key',
    ];
    const responseChecks = [];
    page.on('response', (response) => {
      if (
        /text|json|javascript/.test(response.headers()['content-type'] || '')
      ) {
        responseChecks.push(
          response
            .text()
            .then((text) => {
              for (const secret of secrets)
                assert(
                  !text.includes(secret),
                  'Private credential in browser response',
                );
            })
            .catch((error) => {
              if (error instanceof assert.AssertionError) throw error;
              // Redirect/prefetch responses can be canceled by client navigation.
            }),
        );
      }
    });
    page.setDefaultTimeout(20000);
    // Fail any unexpected external request before it leaves the browser.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (
        ['127.0.0.1', 'localhost'].includes(
          new URL(req.url(), origin).hostname,
        ) ||
        req.url().startsWith('data:')
      )
        req.continue();
      else {
        errors.push(`External request: ${req.url()}`);
        req.abort();
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const text = async (value) =>
      page.waitForFunction(
        (s) => document.body.innerText.includes(s),
        {},
        value,
      );
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${origin}/?date=2099-01-01`, {
      waitUntil: 'networkidle0',
    });
    await text('Película de prueba');
    await page.type('input[type="search"]', 'inexistente');
    await text('No encontramos nada');
    await page.locator('::-p-text(Limpiar búsqueda)').click();
    await text('Película de prueba');
    await page.click('[aria-label="Filtrar por zona CABA"]');
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('zone') === 'CABA',
    );
    assert.equal(new URL(page.url()).searchParams.get('date'), '2099-01-01');
    await page.click('a[href="/movie/1?date=2099-01-01"]');
    await text('Sala de prueba');
    const ticket = await page.$eval(
      'a[href="https://tickets.example.test/1"]',
      (el) => ({ target: el.target, rel: el.rel }),
    );
    assert.equal(ticket.target, '_blank');
    assert.match(ticket.rel, /noopener/);
    await page.select(
      'select[aria-label="Filtrar horarios por complejo de cine"]',
      '10',
    );
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('cinemaId') === '10',
    );
    assert.equal(new URL(page.url()).searchParams.get('date'), '2099-01-01');
    await page.screenshot({
      path: path.join(artifactDir, 'detail-desktop.png'),
      fullPage: true,
    });

    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${origin}/proximamente`, { waitUntil: 'networkidle0' });
    await page.click('button[aria-haspopup="dialog"]');
    await page.waitForSelector('[role="dialog"]');
    assert.equal(
      await page.$eval('[role="dialog"]', (el) =>
        el.contains(document.activeElement),
      ),
      true,
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.$eval('[role="dialog"]', (el) =>
        el.contains(document.activeElement),
      ),
      true,
    );
    await page.screenshot({
      path: path.join(artifactDir, 'dialog-mobile.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    assert.equal(
      await page.$eval(
        'button[aria-haspopup="dialog"]',
        (el) => el === document.activeElement,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await page.goto(`${origin}/?date=2099-01-01&zone=GBA+Sur`, {
      waitUntil: 'networkidle0',
    });
    await text('No encontramos nada');
    await page.goto(`${origin}/movie/999`, { waitUntil: 'networkidle0' });
    await text('Película o página no encontrada');
    assert.deepEqual(errors, []);
    // Expected database permission failure must reach the error boundary, never an empty grid.
    await admin.$executeRawUnsafe(
      `REVOKE SELECT (id) ON "Movie" FROM "${readerRole}"`,
    );
    await page.goto(`${origin}/movie/2147483647`, {
      waitUntil: 'networkidle0',
    });
    await text('Ocurrió un problema inesperado');
    await Promise.all(responseChecks);
    assert(
      requests.length > 0 &&
        requests.every(
          (url) => new URL(url, apiOrigin).pathname === '/movie/upcoming',
        ),
    );
    console.log(
      'Browser journey passed: search, filters, dates, cinema, ticket safety, mobile dialog/focus, empty, 404 and database failure; no NestJS server.',
    );
  } finally {
    if (browser) await browser.close();
    if (next && next.exitCode === null) {
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      else {
        next.kill('SIGTERM');
        await once(next, 'exit');
      }
    }
    await admin.$executeRawUnsafe(
      `GRANT SELECT (id) ON "Movie" TO "${readerRole}"`,
    );
    await admin.$disconnect();
    api.closeAllConnections();
    await new Promise((resolve) => api.close(resolve));
    fs.writeFileSync(path.join(artifactDir, 'next.log'), serverLog);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
