import "server-only";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { createCatalog } from "./catalog.ts";
import { readCatalog } from "./database.ts";
import {
  getTodayArgentina,
  parseCoordinatePair,
  resolveSelectedDate,
} from "../dates.ts";
import { apiGet } from "../api.ts";
import type { BillboardFilters, UpcomingMovie } from "../api.ts";

function cacheNamespace() {
  try {
    const url = new URL(process.env.SUPABASE_DATABASE_URL || "");
    // Partition deploy/test databases without storing passwords in cache keys.
    return createHash("sha256")
      .update(
        JSON.stringify([url.hostname, url.port, url.pathname, url.username]),
      )
      .digest("hex");
  } catch {
    return "unconfigured";
  }
}
const namespace = cacheNamespace();

const cachedBillboard = unstable_cache(
  (date: string, zone: string, chainId: string, cinemaId: string) =>
    readCatalog((sql) =>
      createCatalog(sql).nowPlaying({ date, zone, chainId, cinemaId }),
    ),
  ["supabase-billboard-v1", namespace],
  { revalidate: 300 },
);
const cachedDetail = unstable_cache(
  (id: string, date: string) =>
    readCatalog((sql) => createCatalog(sql).detail(id, date)),
  ["supabase-detail-v1", namespace],
  { revalidate: 300 },
);
export const getCinemas = unstable_cache(
  () => readCatalog((sql) => createCatalog(sql).cinemas()),
  ["supabase-cinemas-v1", namespace],
  { revalidate: 3600 },
);

export function getNowPlaying(filters: BillboardFilters = {}) {
  return cachedBillboard(
    resolveSelectedDate(filters.date),
    filters.zone || "",
    filters.chainId || "",
    filters.cinemaId || "",
  );
}
export function getMovieDetail(id: string, date?: string) {
  return cachedDetail(id, resolveSelectedDate(date));
}
export function getMoviesForCinema(cinemaId: string, date?: string) {
  return getNowPlaying({ cinemaId, date });
}
export async function getCinemaById(id: string) {
  for (const chain of await getCinemas()) {
    const cinema = chain.locations.find((c) => String(c.id) === id);
    if (cinema) return { ...cinema, chainName: chain.name };
  }
  return null;
}
export async function getNearbyCinemas(lat: string, lng: string) {
  const coords = parseCoordinatePair(lat, lng);
  if (!coords) throw new Error("Coordenadas inválidas");
  const radians = (n: number) => (n * Math.PI) / 180;
  return (await getCinemas())
    .flatMap((chain) => chain.locations)
    .filter((c) => c.lat !== null && c.lng !== null && c.lat !== 0)
    .map((c) => {
      const a =
        Math.sin(radians(c.lat! - Number(coords.lat)) / 2) ** 2 +
        Math.cos(radians(Number(coords.lat))) *
          Math.cos(radians(c.lat!)) *
          Math.sin(radians(c.lng! - Number(coords.lng)) / 2) ** 2;
      return {
        ...c,
        distance:
          Math.round(6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) * 10) / 10,
      };
    })
    .sort((a, b) => a.distance - b.distance);
}

interface TmdbUpcoming {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview?: string;
}
const upcoming = unstable_cache(
  async (today: string): Promise<UpcomingMovie[]> => {
    const key = process.env.TMDB_API_KEY;
    if (!key) throw new Error("El servicio de estrenos no está configurado.");
    // Only a localhost fixture override is allowed outside production.
    let base = "https://api.themoviedb.org/3";
    if (process.env.NODE_ENV !== "production" && process.env.TMDB_FIXTURE_URL) {
      const url = new URL(process.env.TMDB_FIXTURE_URL);
      if (url.hostname !== "127.0.0.1") throw new Error("Invalid TMDB fixture");
      base = url.toString().replace(/\/$/, "");
    }
    const data = await apiGet<{ results: TmdbUpcoming[] }>(
      "/movie/upcoming",
      { api_key: key, language: "es-MX", region: "AR", page: "1" },
      3600,
      { apiBaseUrl: base },
    ).catch(() => {
      throw new Error("No se pudieron obtener los próximos estrenos.");
    });
    if (
      !Array.isArray(data?.results) ||
      data.results.some(
        (m) =>
          !Number.isInteger(m.id) ||
          typeof m.title !== "string" ||
          typeof m.release_date !== "string",
      )
    )
      throw new Error("No se pudieron obtener los próximos estrenos.");
    return data.results
      .map((m) => ({
        id: m.id,
        title: m.title,
        posterUrl: m.poster_path
          ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
          : null,
        releaseDate: m.release_date,
        overview: m.overview || "",
        isReRelease: m.release_date < today,
      }))
      .sort(
        (a, b) =>
          Number(a.isReRelease) - Number(b.isReRelease) ||
          a.releaseDate.localeCompare(b.releaseDate),
      );
  },
  ["tmdb-upcoming-v1"],
  { revalidate: 3600 },
);
export function getUpcomingMovies() {
  return upcoming(getTodayArgentina());
}
