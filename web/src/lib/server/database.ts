import "server-only";
import postgres from "postgres";
import type { TransactionSql } from "postgres";

const globalDatabase = globalThis as typeof globalThis & {
  catalogDatabase?: ReturnType<typeof postgres>;
};

function database() {
  if (globalDatabase.catalogDatabase) return globalDatabase.catalogDatabase;
  const value = process.env.SUPABASE_DATABASE_URL;
  if (!value)
    throw new Error("SUPABASE_DATABASE_URL is required on the server");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid server database configuration");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !/^cine_radar_web(?:[._]|$)/.test(decodeURIComponent(url.username))
  ) {
    throw new Error(
      "A dedicated cine_radar_web reader is required; owner credentials are forbidden",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  globalDatabase.catalogDatabase = postgres(value, {
    max: 2,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local
      ? false
      : { rejectUnauthorized: true, ca: process.env.SUPABASE_CA_CERT },
    onnotice: () => undefined,
  });
  return globalDatabase.catalogDatabase;
}

export async function readCatalog<T>(
  work: (sql: TransactionSql) => Promise<T>,
): Promise<T> {
  try {
    return (await database().begin("read only", async (sql) => {
      await sql`SELECT set_config('statement_timeout','8000',true),set_config('lock_timeout','2000',true)`;
      return await work(sql);
    })) as T;
  } catch {
    // Do not attach the driver error: it can contain connection or query details
    // in development overlays, server-rendered errors or hosting logs.
    throw new Error(
      "No se pudo consultar la cartelera. Revisá la configuración privada del servidor.",
    );
  }
}
