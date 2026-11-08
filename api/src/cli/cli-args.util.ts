export const ALLOWED_CHAIN_KEYS = [
  'atlas',
  'multiplex',
  'showcase',
  'cinemark',
  'cinemacenter',
  'cinepolis',
] as const;

export type AllowedChainKey = (typeof ALLOWED_CHAIN_KEYS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_CHAIN_KEYS);

/**
 * Validates CLI arguments for the scraper runner.
 * Returns null when all chains should run (empty or "all"),
 * or the canonical lowercase chain key when a single valid chain is requested.
 */
export function parseCliChainArg(
  positionalArgs: readonly string[],
  envChainKey?: string,
): AllowedChainKey | null {
  if (positionalArgs.length > 1) {
    throw new Error(
      `Se esperaba como máximo 1 argumento de cadena, pero se recibieron ${positionalArgs.length}. Valores permitidos: all, ${ALLOWED_CHAIN_KEYS.join(', ')}`,
    );
  }

  const rawValue = positionalArgs[0] ?? envChainKey ?? '';
  const normalized = rawValue.trim().toLowerCase();

  if (normalized === '' || normalized === 'all') {
    return null;
  }

  if (!/^[a-z]+$/.test(normalized) || !ALLOWED_SET.has(normalized)) {
    throw new Error(
      `Clave de cadena inválida "${rawValue}". Valores permitidos: all, ${ALLOWED_CHAIN_KEYS.join(', ')}`,
    );
  }

  return normalized as AllowedChainKey;
}
