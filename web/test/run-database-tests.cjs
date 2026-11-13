/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness shares the existing Prisma runner. */
const { PrismaClient } = require("../../api/node_modules/@prisma/client");
const { provisionReader } = require("../../api/scripts/web-reader.cjs");
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { seed } = require("./fixture-db.cjs");
const value = process.env.INTEGRATION_DATABASE_URL;
if (!value) throw new Error("Use api/test/run-postgres-tests.cjs --web");
const url = new URL(value);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^\/cine_radar_test_[a-f0-9]{32}$/.test(url.pathname)
)
  throw new Error("Refuse configured/non-test database");
const db = new PrismaClient({ datasources: { db: { url: value } } });
const role = "cine_radar_web_" + randomBytes(8).toString("hex");
const password = randomBytes(32).toString("base64url");
function run(args, env) {
  const r = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error("Standalone Next verification failed");
}
(async () => {
  let created = false;
  try {
    await provisionReader(db, role, password);
    created = true;
    url.username = role;
    url.password = password;
    const env = {
      SUPABASE_DATABASE_URL: url.toString(),
      INTEGRATION_DATABASE_URL: value,
    };
    await seed(db);
    run(
      [
        "--conditions=react-server",
        "--experimental-strip-types",
        "--test",
        path.join(__dirname, "catalog.integration.test.ts"),
      ],
      env,
    );
    if (process.argv.includes("--browser")) {
      await seed(db);
      run([path.resolve(__dirname, "../../api/test/browser-journey.cjs")], env);
    }
  } catch (e) {
    console.error("Web verification failed:", e.code || e.message);
    process.exitCode = 1;
  } finally {
    if (created) {
      await db.$executeRawUnsafe(`DROP OWNED BY "${role}"`);
      await db.$executeRawUnsafe(`DROP ROLE "${role}"`);
    }
    await db.$disconnect();
  }
})();
