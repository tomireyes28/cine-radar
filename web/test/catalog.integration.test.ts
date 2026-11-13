import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createCatalog } from "../src/lib/server/catalog.ts";
import { readCatalog } from "../src/lib/server/database.ts";
const reader = postgres(process.env.SUPABASE_DATABASE_URL!, {
  max: 1,
  prepare: false,
});
const catalog = createCatalog(reader);
after(async () => {
  await reader.end();
  await (
    globalThis as { catalogDatabase?: ReturnType<typeof postgres> }
  ).catalogDatabase?.end();
});
describe("Standalone Next catalog on real PostgreSQL with restricted reader", () => {
  it("does not print malformed private configuration from the setup CLI", () => {
    const script = fileURLToPath(
      new URL("../../api/scripts/setup-web-reader.cjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        DATABASE_URL: "invalid-private-credential-sentinel",
      },
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert(
      !`${result.stdout}${result.stderr}`.includes(
        "invalid-private-credential-sentinel",
      ),
    );
    assert.match(result.stderr, /Reader setup failed/);
  });
  it("rejects owner credentials without exposing the URL, then opens bounded read-only transactions", async () => {
    const saved = process.env.SUPABASE_DATABASE_URL;
    process.env.SUPABASE_DATABASE_URL = process.env.INTEGRATION_DATABASE_URL;
    try {
      await assert.rejects(
        readCatalog(async (sql) => sql`SELECT 1`),
        (error) => {
          assert(error instanceof Error);
          assert(!error.message.includes("postgresql://"));
          assert.equal(error.cause, undefined);
          return true;
        },
      );
    } finally {
      process.env.SUPABASE_DATABASE_URL = saved;
    }
    const rows = await readCatalog(
      async (sql) =>
        sql`SELECT current_setting('transaction_read_only') AS mode,current_setting('statement_timeout') AS timeout`,
    );
    assert.equal(rows[0].mode, "on");
    assert.equal(rows[0].timeout, "8s");
  });
  it("uses Argentina day boundaries, all selected venues and a single representative showtime", async () => {
    const movies = await catalog.nowPlaying({ date: "2099-01-01" });
    assert.equal(movies.length, 1);
    assert.equal(movies[0].id, 1);
    assert.equal(movies[0].cinemaCount, 2);
    assert.equal(movies[0].showtimes?.length, 1);
    assert.equal(movies[0].showtimes?.[0].dateTime, "2099-01-01T23:00:00.000Z");
    assert.equal((await catalog.nowPlaying({ date: "2099-01-02" }))[0].id, 2);
  });
  it("combines city/name, zone, chain and cinema filters with literal SQL pattern characters", async () => {
    const base = { date: "2099-01-01" };
    assert.equal(
      (
        await catalog.nowPlaying({
          ...base,
          city: "córDOBA",
          chainId: "1",
          cinemaId: "10",
          zone: "caba",
        })
      ).length,
      1,
    );
    assert.equal(
      (await catalog.nowPlaying({ ...base, city: "Cordoba" })).length,
      0,
    );
    assert.equal(
      (await catalog.nowPlaying({ ...base, city: "100%_\\" })).length,
      1,
    );
    assert.equal(
      (await catalog.nowPlaying({ ...base, city: "' OR true --" })).length,
      0,
    );
    assert.equal(
      (await catalog.nowPlaying({ ...base, zone: "Interior", cinemaId: "10" }))
        .length,
      0,
    );
  });
  it("returns null only for a missing/invalid movie; existing movie can have no functions that day", async () => {
    assert.equal(await catalog.detail("999"), null);
    assert.equal(await catalog.detail("1 OR 1=1"), null);
    assert.deepEqual((await catalog.detail("1", "2099-01-03"))?.cinemas, []);
    const detail = await catalog.detail("1", "2099-01-01");
    assert.equal(detail?.cinemas.length, 2);
    assert.equal(
      detail?.cinemas[0].functions[0].time,
      "2099-01-02T02:59:59.999Z",
    );
  });
  it("returns the complete catalog without leaking worker identity fields", async () => {
    const chains = await catalog.cinemas();
    assert.equal(chains[0].locations.length, 2);
    const movie = await catalog.detail("1", "2099-01-01");
    assert.ok(!("normalizedKey" in movie!));
    assert.ok(!("tmdbStatus" in movie!));
  });
  it("has no DML permission even if it explicitly requests a read-write transaction", async () => {
    await assert.rejects(
      reader.begin("read write", async (tx) => {
        await tx`UPDATE "Movie" SET title='forbidden' WHERE id=1`;
      }),
      { code: "42501" },
    );
    await assert.rejects(
      reader.begin("read write", async (tx) => {
        await tx`DELETE FROM "Showtime" WHERE false`;
      }),
      { code: "42501" },
    );
    await assert.rejects(reader`SELECT * FROM "ScrapeRun"`, { code: "42501" });
    await assert.rejects(reader`SELECT "normalizedKey" FROM "Movie"`, {
      code: "42501",
    });
    await assert.rejects(reader`SET ROLE postgres`, { code: "42501" });
  });
});
