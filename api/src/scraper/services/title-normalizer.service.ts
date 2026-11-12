import { Injectable } from '@nestjs/common';
import {
  normalizeCinemaTitle,
  extractReleaseYearHint,
  normalizeScreeningFormat,
  normalizeScreeningLanguage,
} from '../../common/utils/title-normalizer.util';

@Injectable()
export class TitleNormalizerService {
  normalize(rawTitle: string): string {
    return normalizeCinemaTitle(rawTitle);
  }

  identityKey(rawTitle: string, sourceMovieId?: string): string {
    if (sourceMovieId) return JSON.stringify(['source', sourceMovieId]);
    return JSON.stringify([
      'title',
      this.normalize(rawTitle).toLowerCase(),
      extractReleaseYearHint(rawTitle) ?? null,
    ]);
  }

  normalizeFormat(rawFormat?: string): string {
    return normalizeScreeningFormat(rawFormat);
  }

  normalizeLanguage(rawLanguage?: string): string {
    return normalizeScreeningLanguage(rawLanguage);
  }
}
