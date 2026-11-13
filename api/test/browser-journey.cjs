// Real Chromium + Next.js, with an isolated fixture API. No configured database,
// TMDB or cinema provider is contacted. Run from api/: npm run test:browser.
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
  const detail = {
    ...movie,
    cinemas: [
      {
        cinema: {
          id: 10,
          name: 'Sala de prueba',
          address: 'Dirección de prueba',
          zone: 'CABA',
          chain: { name: 'Cadena de prueba' },
        },
        functions: [
          {
            id: 1,
            time: '2099-01-01T23:00:00.000Z',
            format: '2D',
            language: 'SUB',
            url: 'https://tickets.example.test/1',
          },
        ],
      },
    ],
  };
  const api = http.createServer((req, res) => {
    const url = new URL(req.url, apiOrigin);
    requests.push(url.pathname + url.search);
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/movies/now-playing') {
      if (url.searchParams.get('chainId') === '500') {
        res.writeHead(503).end('{}');
        return;
      }
      res.end(
        JSON.stringify(
          url.searchParams.get('zone') === 'Interior' ? [] : [movie],
        ),
      );
    } else if (url.pathname === '/movies/upcoming') {
      res.end(
        JSON.stringify([
          { ...movie, releaseDate: '2099-01-01', isReRelease: false },
        ]),
      );
    } else if (url.pathname === '/movies/1') {
      res.end(JSON.stringify(detail));
    } else if (url.pathname === '/cinemas') {
      res.end(
        JSON.stringify([
          {
            id: 1,
            name: 'Cadena de prueba',
            locations: [
              {
                id: 10,
                name: 'Sala de prueba',
                address: 'Dirección de prueba',
                chainId: 1,
                lat: 0,
                lng: 0,
              },
            ],
          },
        ]),
      );
    } else {
      res.writeHead(404).end('{}');
    }
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
          NEXT_PUBLIC_API_URL: apiOrigin,
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
    await page.goto(`${origin}/?zone=Interior`, { waitUntil: 'networkidle0' });
    await text('No encontramos nada');
    await page.goto(`${origin}/movie/999`, { waitUntil: 'networkidle0' });
    await text('Película o página no encontrada');
    assert.deepEqual(errors, []);
    // Expected upstream failure must reach the error boundary, never an empty grid.
    await page.goto(`${origin}/?chainId=500`, { waitUntil: 'networkidle0' });
    await text('Ocurrió un problema inesperado');
    assert(requests.some((url) => url.includes('zone=CABA')));
    assert(requests.some((url) => url.includes('/movies/1?date=2099-01-01')));
    console.log(
      'Browser journey passed: search, filters, dates, cinema, ticket safety, mobile dialog/focus, empty, 404 and 503.',
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
    api.closeAllConnections();
    await new Promise((resolve) => api.close(resolve));
    fs.writeFileSync(path.join(artifactDir, 'next.log'), serverLog);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
