import { Injectable } from '@nestjs/common';

@Injectable()
export class TitleNormalizerService {
  private readonly knownAliases: Record<string, string> = {
    'CUMBRES BARRASCOSAS': 'Cumbres Borrascosas',
    'GOAT: LA CABRA': 'GOAT',
    'LUNA NUEVA': 'La Saga Crepúsculo: Luna Nueva',
    'AVENGERS: DOOMSDAY INFINITY VISION': 'Avengers: Doomsday',
    'ESCUELA DE MOSTRUOS': 'Escuela de monstruos',
    'VERITY': 'Verity',
  };

  normalize(rawTitle: string): string {
    if (!rawTitle) return '';

    let title = rawTitle
      .split('|')[0]
      .split(' - ')[0]
      .replace(/\(.*?\)/g, ' ')
      .replace(/\[.*?\]/g, ' ')
      .replace(/:([^\s])/g, ': $1')
      .replace(/[-_]/g, ' ')
      .trim();

    const upper = title.toUpperCase();
    for (const [pattern, replacement] of Object.entries(this.knownAliases)) {
      if (upper.includes(pattern)) {
        return replacement;
      }
    }

    const technicalTokensRegex =
      /\b(3D|2D|XD|4D|IMAX|ATMOS|D-BOX|DBOX|DOBLADA|DOBLADO|SUBTITULADA|SUBTITULADO|CASTELLANO|CAST|SUBT|SUB|LATINO|MACROXE|COMFORT|PLATINUM|VIP|48FPS|ESP|ENG|REESTRENO)\b/gi;

    title = title
      .replace(/\b\d+\s*°?\s*ANIVERSARIO\b/gi, ' ')
      .replace(/:\s*VERSI[OÓ]N\s+EXTENDIDA/gi, ' ')
      .replace(/\bVERSI[OÓ]N\s+EXTENDIDA\b/gi, ' ')
      .replace(technicalTokensRegex, ' ');
    return title.replace(/\s+/g, ' ').trim();
  }

  normalizeFormat(rawFormat?: string): string {
    const upper = (rawFormat || '').toUpperCase();
    if (upper.includes('IMAX')) return 'IMAX';
    if (upper.includes('4D')) return '4D';
    if (upper.includes('XD')) return 'XD';
    if (upper.includes('D-BOX') || upper.includes('DBOX')) return 'D-BOX';
    if (upper.includes('PLATINUM') || upper.includes('VIP')) return 'VIP';
    if (upper.includes('3D')) return '3D';
    return '2D';
  }

  normalizeLanguage(rawLanguage?: string): string {
    const upper = (rawLanguage || '').toUpperCase();
    if (
      upper.includes('SUBT') ||
      upper === 'SUB' ||
      upper.includes('(S)') ||
      upper.includes('INGL')
    ) {
      return 'SUBTITULADA';
    }
    return 'CASTELLANO';
  }
}
