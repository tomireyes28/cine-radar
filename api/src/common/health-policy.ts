export const HEALTH_METRICS_TTL_MS = 15_000;
export const SCRAPE_FRESHNESS_MS = 36 * 60 * 60 * 1000;
export const SCRAPE_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SCRAPE_RUN_PRUNE_BATCH = 500;
export const HEALTH_CHAIN_KEYS = [
  'atlas',
  'multiplex',
  'showcase',
  'cinemark',
  'cinemacenter',
  'cinepolis',
] as const;
