const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

// Never fall back to DATABASE_URL/.env: this runner creates and drops only its own database.
async function main() {
  if (!process.env.TEST_POSTGRES_URL)
    throw new Error(
      'Set TEST_POSTGRES_URL to a disposable localhost PostgreSQL server.',
    );
  const adminUrl = new URL(process.env.TEST_POSTGRES_URL);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname) ||
    !['postgres:', 'postgresql:'].includes(adminUrl.protocol)
  ) {
    throw new Error('Integration tests require a localhost PostgreSQL server.');
  }
  const database = `cine_radar_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl.toString() } },
  });
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${database}`;
  const env = {
    ...process.env,
    DATABASE_URL: testUrl.toString(),
    INTEGRATION_DATABASE_URL: testUrl.toString(),
    NODE_ENV: 'test',
    DISABLE_INTERNAL_CRON: 'true',
  };
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    created = true;
    function run(file, args) {
      const result = spawnSync(
        process.execPath,
        [require.resolve(file), ...args],
        { env, stdio: 'inherit', windowsHide: true },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `Integration command failed (${result.status}): ${file}`,
        );
    }
    run('prisma/build/index.js', ['migrate', 'deploy']);
    run('prisma/build/index.js', [
      'migrate',
      'diff',
      '--from-url',
      testUrl.toString(),
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ]);
    run('jest/bin/jest', [
      '--config',
      'test/jest-integration.json',
      '--runInBand',
      ...process.argv.slice(2),
    ]);
  } finally {
    if (created) {
      await admin.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${database} AND pid <> pg_backend_pid()`;
      await admin.$executeRawUnsafe(`DROP DATABASE "${database}"`);
    }
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
