// Run once from api/ with its private .env configured. Never prints credentials.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const postgres = require('../../web/node_modules/postgres').default;
const { provisionReader } = require('./web-reader.cjs');
async function setup() {
  dotenv.config({ quiet: true });
  const envPath = path.resolve(__dirname, '../../web/.env.local');
  const pendingPath = envPath + '.reader-pending';
  const settings = fs.existsSync(envPath)
    ? dotenv.parse(fs.readFileSync(envPath))
    : {};
  const role = 'cine_radar_web';
  const ca = fs.readFileSync(
    path.resolve(__dirname, '../../web/certs/supabase-ca.crt'),
    'utf8',
  );
  let savedUrl =
    settings.SUPABASE_DATABASE_URL ||
    (fs.existsSync(pendingPath) ? fs.readFileSync(pendingPath, 'utf8') : null);
  const url = new URL(process.env.DATABASE_URL);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    !local &&
    (!process.env.DIRECT_URL ||
      url.port !== '6543' ||
      !url.hostname.endsWith('.pooler.supabase.com'))
  )
    throw new Error('Expected configured Supabase pooler and DIRECT_URL');
  const project = local
    ? ''
    : decodeURIComponent(url.username).split('.').slice(1).join('.');
  if (!local && !project) throw new Error('Missing Supabase project reference');
  url.username = role + (local ? '' : '.' + project);
  if (savedUrl && new URL(savedUrl).hostname.toLowerCase() === 'pooler_host')
    savedUrl = null;
  if (savedUrl) {
    const saved = new URL(savedUrl);
    if (
      saved.hostname !== url.hostname ||
      saved.port !== url.port ||
      saved.pathname !== url.pathname ||
      saved.username !== url.username
    )
      throw new Error(
        'Existing web configuration targets another database; refusing credential reuse',
      );
  }
  const password = savedUrl
    ? decodeURIComponent(new URL(savedUrl).password)
    : randomBytes(32).toString('base64url');
  url.password = password;
  url.search = '';
  const admin = new PrismaClient({
    datasources: {
      db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL },
    },
  });
  let reader;
  let stage = 'role inspection';
  try {
    const exists =
      await admin.$queryRaw`SELECT rolname FROM pg_roles WHERE rolname=${role}`;
    stage = 'reader privilege provisioning';
    if (!exists.length) await provisionReader(admin, role, password);
    else if (!savedUrl || new URL(savedUrl).username !== url.username)
      throw new Error(
        'Existing role requires its saved reader credential; no implicit rotation',
      );
    fs.writeFileSync(pendingPath, url.toString(), { mode: 0o600 });
    stage = 'reader connection';
    reader = postgres(url.toString(), {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      ssl: local ? false : { rejectUnauthorized: true, ca },
      onnotice: () => {},
    });
    const identity = await reader`SELECT current_user AS name`;
    if (identity[0].name !== role)
      throw new Error('Unexpected database identity');
    stage = 'reader permissions verification';
    await reader`SELECT id,title FROM "Movie" LIMIT 1`;
    let denied = false;
    try {
      await reader.begin('read write', async (tx) => {
        await tx`UPDATE "Movie" SET title=title WHERE false`;
      });
    } catch (e) {
      denied = ['42501', '25006'].includes(e.code);
      console.log('Reader denial SQL state:', e.code || 'unrecognized');
    }
    if (!denied) throw new Error('Reader write protection failed');
    delete settings.NEXT_PUBLIC_API_URL;
    settings.SUPABASE_DATABASE_URL = url.toString();
    settings.SUPABASE_CA_CERT = ca;
    settings.TMDB_API_KEY = process.env.TMDB_API_KEY;
    if (!settings.TMDB_API_KEY) throw new Error('TMDB_API_KEY required');
    fs.writeFileSync(
      envPath,
      Object.entries(settings)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join('\n') + '\n',
      { mode: 0o600 },
    );
    fs.unlinkSync(pendingPath);
    console.log(
      'Dedicated read-only role verified; private web/.env.local configured. No credentials printed.',
    );
  } catch (e) {
    const safe = [
      'Reader inherited unexpected write privileges',
      'Reader inherited internal table access',
      'Existing role requires its saved reader credential; no implicit rotation',
      'Reader write protection failed',
      'Unexpected database identity',
    ];
    console.error(
      'Reader setup failed:',
      stage,
      e.code ||
        (safe.includes(e.message) ? e.message : 'configuration validation'),
    );
    process.exitCode = 1;
  } finally {
    if (reader) await reader.end();
    await admin.$disconnect();
  }
}
setup().catch(() => {
  console.error('Reader setup failed: invalid private configuration');
  process.exitCode = 1;
});
