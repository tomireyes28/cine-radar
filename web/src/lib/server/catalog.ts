import "server-only";
import type { Sql } from "postgres";
import type { Movie, MovieDetail } from "../../types/movie.ts";
import type { BillboardFilters, CinemaChain } from "../api.ts";
import { isValidPositiveInt4, resolveSelectedDate } from "../dates.ts";

export function createCatalog(sql: Pick<Sql, "unsafe">) {
  const movieColumns = `m.id,m."tmdbId",m.title,m."posterUrl",m."backdropUrl",m.overview,m."releaseDate",m.duration,m.rating,m.genres`;
  function selection(filters: BillboardFilters & { city?: string }) {
    const date = resolveSelectedDate(filters.date);
    const start = new Date(`${date}T00:00:00-03:00`);
    const end = new Date(start.getTime() + 86400000);
    const city = filters.city?.trim().replace(/[\\%_]/g, "\\$&");
    return [
      start.toISOString(),
      end.toISOString(),
      filters.zone?.trim() || null,
      isValidPositiveInt4(filters.chainId) ? Number(filters.chainId) : null,
      isValidPositiveInt4(filters.cinemaId) ? Number(filters.cinemaId) : null,
      city ? `%${city}%` : null,
    ];
  }
  // All request values are parameters. Only these static SQL fragments are joined.
  const where = `s."dateTime" >= $1::timestamp AND s."dateTime" < $2::timestamp
    AND ($3::text IS NULL OR lower(l.zone)=lower($3))
    AND ($4::int IS NULL OR l."chainId"=$4)
    AND ($5::int IS NULL OR l.id=$5)
    AND ($6::text IS NULL OR l.city ILIKE $6 OR l.name ILIKE $6)`;
  const instant = `to_char(s."dateTime", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  return {
    async nowPlaying(
      filters: BillboardFilters & { city?: string } = {},
    ): Promise<Movie[]> {
      const rows = await sql.unsafe<Movie[]>(
        `WITH selected AS (
        SELECT s.*,l.zone,c.name AS chain_name,
          row_number() OVER (PARTITION BY s."movieId" ORDER BY
            CASE WHEN s."dateTime">=timezone('UTC',now()) THEN 0 ELSE 1 END,s."dateTime",s.id) AS position
        FROM "Showtime" s JOIN "CinemaLocation" l ON l.id=s."locationId"
        JOIN "CinemaChain" c ON c.id=l."chainId" WHERE ${where}
      ) SELECT ${movieColumns},count(DISTINCT s."locationId")::int AS "cinemaCount",
        array_agg(DISTINCT s.chain_name) AS "chainNames",array_agg(DISTINCT s.zone) AS zones,
        array_agg(DISTINCT s.format) AS formats,
        jsonb_agg(jsonb_build_object('id',s.id,'dateTime',${instant},'format',s.format,
          'language',s.language,'ticketUrl',s."ticketUrl")) FILTER(WHERE s.position=1) AS showtimes
      FROM selected s JOIN "Movie" m ON m.id=s."movieId"
      GROUP BY m.id ORDER BY count(DISTINCT s."locationId") DESC,m.id`,
        selection(filters),
      );
      return Array.from(rows);
    },
    async detail(id: string, date?: string): Promise<MovieDetail | null> {
      if (!isValidPositiveInt4(id)) return null;
      const movies = await sql.unsafe<Movie[]>(
        `SELECT ${movieColumns} FROM "Movie" m WHERE m.id=$1`,
        [Number(id)],
      );
      if (!movies.length) return null;
      const rows = await sql.unsafe<
        {
          id: number;
          name: string;
          address: string;
          zone: string;
          chain: string;
          functions: MovieDetail["cinemas"][number]["functions"];
        }[]
      >(
        `SELECT l.id,l.name,l.address,l.zone,c.name AS chain,
        jsonb_agg(jsonb_build_object('id',s.id,'time',${instant},'format',s.format,
          'language',s.language,'url',s."ticketUrl") ORDER BY s."dateTime",s.id) AS functions
        FROM "Showtime" s JOIN "CinemaLocation" l ON l.id=s."locationId"
        JOIN "CinemaChain" c ON c.id=l."chainId"
        WHERE ${where} AND s."movieId"=$7 GROUP BY l.id,c.name ORDER BY l.name,l.id`,
        [...selection({ date }), Number(id)],
      );
      return {
        ...movies[0],
        cinemas: rows.map((r) => ({
          cinema: {
            id: r.id,
            name: r.name,
            address: r.address,
            zone: r.zone,
            chain: { name: r.chain },
          },
          functions: r.functions,
        })),
      };
    },
    async cinemas(): Promise<CinemaChain[]> {
      const rows = await sql.unsafe<
        CinemaChain[]
      >(`SELECT c.id,c.name,c."logoUrl",
        COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'address',l.address,
          'city',l.city,'zone',l.zone,'lat',l.lat,'lng',l.lng,'chainId',l."chainId")
          ORDER BY l.name,l.id) FILTER(WHERE l.id IS NOT NULL),'[]'::jsonb) AS locations
        FROM "CinemaChain" c LEFT JOIN "CinemaLocation" l ON l."chainId"=c.id
        GROUP BY c.id ORDER BY c.name,c.id`);
      return Array.from(rows);
    },
  };
}
