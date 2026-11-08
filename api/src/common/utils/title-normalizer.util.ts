const KNOWN_TITLE_ALIASES: Record<string, string> = {
  'CUMBRES BARRASCOSAS': 'Cumbres Borrascosas',
  'GOAT: LA CABRA': 'GOAT',
  'LUNA NUEVA': 'La Saga Crepúsculo: Luna Nueva',
  'AVENGERS: DOOMSDAY INFINITY VISION': 'Avengers: Doomsday',
  'ESCUELA DE MOSTRUOS': 'Escuela de monstruos',
  VERITY: 'Verity',
};

const HYPHENATED_TECHNICAL_TOKENS_REGEX =
  /\b(D\s*-\s*BOX|DBOX|E\s*-\s*MOTION|4D\s*-\s*X|4DX|SCREEN\s*-\s*X|SCREENX|MONSTER\s+SCREEN)\b/gi;

const TECHNICAL_TOKENS_REGEX =
  /\b(3D|2D|XD|4D|IMAX|ATMOS|DOBLADA|DOBLADO|SUBTITULADA|SUBTITULADO|CASTELLANO|CAST|SUBT|SUB|LATINO|MACROXE|COMFORT|PLATINUM|VIP|48FPS|ESP|ENG|REESTRENO)\b/gi;

export function stripDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extracts a 4-digit release year hint when explicitly enclosed in parentheses or brackets,
 * e.g. `"Batman (1989) 2D SUB"` -> `1989`.
 */
export function extractReleaseYearHint(rawTitle: string): number | undefined {
  if (!rawTitle) return undefined;
  const match = rawTitle.match(/[([]\s*(19\d{2}|20\d{2})\s*[)\]]/);
  if (!match) return undefined;
  return Number(match[1]);
}

/**
 * Canonical title cleaner shared across all 6 cinema scrapers, MovieIdentityService,
 * and TmdbService so title keys and search queries never diverge.
 */
export function normalizeCinemaTitle(rawTitle: string): string {
  if (!rawTitle) return '';

  // 1. Strip pipe-delimited technical trailers ("Title | 48FPS | IMAX")
  let title = rawTitle.split('|')[0];

  // 2. Remove parenthetical and bracketed tags ("(Sala 1)", "[SUBT]", "(1989)")
  title = title
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/:([^\s])/g, ': $1');

  // 3. Remove hyphenated technical tokens (D-BOX, E-MOTION, 4D-X) BEFORE touching separators
  title = title
    .replace(HYPHENATED_TECHNICAL_TOKENS_REGEX, ' ')
    .replace(/\b\d+\s*°?\s*ANIVERSARIO\b/gi, ' ')
    .replace(/:\s*VERSI[OÓ]N\s+EXTENDIDA/gi, ' ')
    .replace(/\bVERSI[OÓ]N\s+EXTENDIDA/gi, ' ')
    .replace(TECHNICAL_TOKENS_REGEX, ' ');

  // 4. Clean trailing separator characters left behind when technical suffixes followed " - " or ":"
  // while preserving legitimate internal hyphens/subtitles ("Spider-Man", "Misión Imposible - Sentencia Final")
  title = title
    .replace(/\s+/g, ' ')
    .replace(/[\s\-:|/]+$/g, '')
    .replace(/^[\s\-:|/]+/g, '')
    .trim();

  if (!title) return '';

  const upperFolded = stripDiacritics(title).toUpperCase();
  for (const [pattern, replacement] of Object.entries(KNOWN_TITLE_ALIASES)) {
    if (upperFolded.includes(stripDiacritics(pattern).toUpperCase())) {
      return replacement;
    }
  }

  return title;
}

/**
 * Classifies screening format consistently across providers.
 */
export function normalizeScreeningFormat(rawFormat?: string): string {
  const upper = (rawFormat || '').toUpperCase();
  if (upper.includes('IMAX')) return 'IMAX';
  if (upper.includes('4D') || upper.includes('E-MOTION')) return '4D';
  if (upper.includes('XD')) return 'XD';
  if (/D\s*-?\s*BOX/.test(upper)) return 'D-BOX';
  if (upper.includes('PLATINUM') || upper.includes('VIP')) return 'VIP';
  if (upper.includes('3D')) return '3D';
  return '2D';
}

/**
 * Classifies screening audio/subtitle language consistently across all 6 providers:
 * - Recognizes `SUB`, `SUBT`, `SUBTITULADA/O`, `(S)`, `VOS`, `VOSE`, `EN SUB`
 * - Recognizes `ENGLISH`, `ENG`, `INGLES`/`INGLÉS`, `IDIOMA ORIGINAL`, standalone/tag `EN`
 * - Avoids false positives on Spanish titles containing `"en"` (`"Un Lugar en Silencio"`)
 *   or words starting with `"SUB"` (`"The Substance"`).
 */
export function normalizeScreeningLanguage(rawLanguage?: string): string {
  if (!rawLanguage) return 'CASTELLANO';

  const rawUpper = rawLanguage.toUpperCase().trim();
  if (!rawUpper) return 'CASTELLANO';

  if (rawUpper.includes('(S)')) {
    return 'SUBTITULADA';
  }

  const folded = stripDiacritics(rawUpper);

  // 1. Explicit subtitle markers take highest precedence (covers "EN SUB", "2D SUB", "2D-Subtitulado")
  if (/\b(SUB|SUBT|SUBTITULAD[OA]S?|SUBTITLED|VOS|VOSE)\b/.test(folded)) {
    return 'SUBTITULADA';
  }

  // 2. Explicit Spanish / dubbed markers
  if (
    /\b(CAST|CASTELLANO|DOBLAD[OA]S?|DOB|ESP|ESPANOL|ES|LAT|LATINO)\b/.test(
      folded,
    )
  ) {
    return 'CASTELLANO';
  }

  // 3. Explicit English / original-language markers when no Spanish/dubbed marker was present
  if (
    /\b(ENG|ENGLISH|INGLES|IDIOMA\s+ORIGINAL|VERSION\s+ORIGINAL)\b/.test(folded)
  ) {
    return 'SUBTITULADA';
  }

  // Standalone ISO code "EN" (or combined only with technical format tokens, e.g. "2D EN", "IMAX EN")
  if (
    /^([\s\-/]*(2D|3D|4D|4DX|XD|IMAX|D-BOX|DBOX|VIP|ATMOS))*[\s\-/]*\bEN\b[\s\-/]*$/.test(
      folded,
    )
  ) {
    return 'SUBTITULADA';
  }

  return 'CASTELLANO';
}

/**
 * Produces a comparable alphanumeric key for matching candidate titles in TMDB.
 */
export function toComparableTitleKey(title: string): string {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
