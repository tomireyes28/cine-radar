// Provision only a dedicated reader; never grant it scraper or identity-write access.
const columns = {
  Movie: [
    'id',
    'tmdbId',
    'title',
    'posterUrl',
    'backdropUrl',
    'overview',
    'releaseDate',
    'duration',
    'rating',
    'genres',
  ],
  CinemaChain: ['id', 'name', 'logoUrl'],
  CinemaLocation: [
    'id',
    'name',
    'address',
    'city',
    'zone',
    'lat',
    'lng',
    'chainId',
  ],
  Showtime: [
    'id',
    'movieId',
    'locationId',
    'dateTime',
    'format',
    'language',
    'ticketUrl',
  ],
};
async function provisionReader(db, role, password) {
  if (
    !/^cine_radar_web(?:_[a-z0-9]+)?$/.test(role) ||
    role.length > 63 ||
    !/^[A-Za-z0-9_-]{32,}$/.test(password)
  )
    throw new Error('Invalid reader provisioning input');
  await db.$transaction(
    async (tx) => {
      const existing = await tx.$queryRawUnsafe(
        'SELECT rolname FROM pg_roles WHERE rolname=$1',
        role,
      );
      if (existing.length)
        throw new Error(
          'Reader already exists; refuse implicit password rotation',
        );
      await tx.$executeRawUnsafe(
        `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10`,
      );
      await tx.$executeRawUnsafe(
        `ALTER ROLE "${role}" SET default_transaction_read_only=on`,
      );
      await tx.$executeRawUnsafe(
        `ALTER ROLE "${role}" SET statement_timeout='8s'`,
      );
      await tx.$executeRawUnsafe(
        `ALTER ROLE "${role}" SET idle_in_transaction_session_timeout='10s'`,
      );
      await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      for (const [table, fields] of Object.entries(columns)) {
        await tx.$executeRawUnsafe(
          `GRANT SELECT (${fields.map((f) => `"${f}"`).join(',')}) ON "${table}" TO "${role}"`,
        );
        for (const operation of [
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'TRIGGER',
          'REFERENCES',
        ]) {
          const allowed = await tx.$queryRawUnsafe(
            'SELECT has_table_privilege($1,$2,$3) AS allowed',
            role,
            `public."${table}"`,
            operation,
          );
          if (allowed[0].allowed)
            throw new Error('Reader inherited unexpected write privileges');
        }
      }
      for (const table of [
        'MovieAlias',
        'ScrapeRun',
        'ScraperLock',
        'ChainScrapeState',
      ]) {
        const allowed = await tx.$queryRawUnsafe(
          'SELECT has_table_privilege($1,$2,$3) AS allowed',
          role,
          `public."${table}"`,
          'SELECT',
        );
        if (allowed[0].allowed)
          throw new Error('Reader inherited internal table access');
      }
    },
    { maxWait: 5000, timeout: 60000 },
  );
}
module.exports = { provisionReader };
