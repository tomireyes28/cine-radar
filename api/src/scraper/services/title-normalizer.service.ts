import { Injectable } from '@nestjs/common';
import {
  normalizeCinemaTitle,
  normalizeScreeningFormat,
  normalizeScreeningLanguage,
} from '../../common/utils/title-normalizer.util';

@Injectable()
export class TitleNormalizerService {
  normalize(rawTitle: string): string {
    return normalizeCinemaTitle(rawTitle);
  }

  normalizeFormat(rawFormat?: string): string {
    return normalizeScreeningFormat(rawFormat);
  }

  normalizeLanguage(rawLanguage?: string): string {
    return normalizeScreeningLanguage(rawLanguage);
  }
}
