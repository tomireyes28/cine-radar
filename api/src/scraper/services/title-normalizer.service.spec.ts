import { TitleNormalizerService } from './title-normalizer.service';

describe('TitleNormalizerService (F11)', () => {
  let service: TitleNormalizerService;

  beforeEach(() => {
    service = new TitleNormalizerService();
  });

  describe('normalize()', () => {
    it('removes format and language tokens from raw cinema titles', () => {
      expect(
        service.normalize('WILDWOOD: EL BOSQUE SALVAJE - 3D CASTELLANO'),
      ).toBe('WILDWOOD: EL BOSQUE SALVAJE');
      expect(
        service.normalize('Dune: Parte Dos | 48FPS | IMAX SUBTITULADA (Sala 1)'),
      ).toBe('Dune: Parte Dos');
    });

    it('strips hyphenated technical tokens like D-BOX and E-MOTION without leaving stray D BOX fragments', () => {
      expect(service.normalize('Gladiador II D-BOX')).toBe('Gladiador II');
      expect(service.normalize('SONIC 3 - 2D D-BOX CASTELLANO')).toBe('SONIC 3');
      expect(service.normalize('FURIOSA E-MOTION 4D SUBT')).toBe('FURIOSA');
    });

    it('preserves legitimate hyphenated titles and non-technical subtitles', () => {
      expect(
        service.normalize('Spider-Man: A Través del Spider-Verso 2D SUB'),
      ).toBe('Spider-Man: A Través del Spider-Verso');
      expect(
        service.normalize('Misión Imposible - Sentencia Final 2D SUBTITULADA'),
      ).toBe('Misión Imposible - Sentencia Final');
    });

    it('removes anniversary and extended edition suffixes', () => {
      expect(service.normalize('ROCKY 50° ANIVERSARIO 2D SUBT')).toBe('ROCKY');
      expect(service.normalize('BACKROOMS: VERSION EXTENDIDA')).toBe(
        'BACKROOMS',
      );
    });

    it('resolves known chain typos and aliases', () => {
      expect(service.normalize('CUMBRES BARRASCOSAS')).toBe(
        'Cumbres Borrascosas',
      );
      expect(service.normalize('Escuela de mostruos')).toBe(
        'Escuela de monstruos',
      );
    });
  });

  describe('normalizeFormat()', () => {
    it('classifies IMAX, 4D, XD, D-BOX, VIP, 3D, and defaults to 2D', () => {
      expect(service.normalizeFormat('IMAX 3D SUBTITULADO')).toBe('IMAX');
      expect(service.normalizeFormat('Sala 4D E-Motion')).toBe('4D');
      expect(service.normalizeFormat('XD ATMOS')).toBe('XD');
      expect(service.normalizeFormat('2D D-BOX')).toBe('D-BOX');
      expect(service.normalizeFormat('PLATINUM 2D')).toBe('VIP');
      expect(service.normalizeFormat('DIGITAL 3D')).toBe('3D');
      expect(service.normalizeFormat('Digital')).toBe('2D');
    });
  });

  describe('normalizeLanguage()', () => {
    it('identifies subtitled and original-English labels across all 6 providers', () => {
      expect(service.normalizeLanguage('2D-Subtitulado')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('SUB')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('EN SUB')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('EN ENGLISH')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('ENGLISH')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('ENG')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('EN')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('INGLÉS')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('GLADIADOR II 2D SUB')).toBe(
        'SUBTITULADA',
      );
    });

    it('classifies Spanish/dubbed screenings and avoids false positives on Spanish titles containing "en" or "sub-"', () => {
      expect(service.normalizeLanguage('CASTELLANO')).toBe('CASTELLANO');
      expect(service.normalizeLanguage('ESP ESPAÑOL')).toBe('CASTELLANO');
      expect(service.normalizeLanguage('DOB Doblada')).toBe('CASTELLANO');
      expect(service.normalizeLanguage('LAT Latino')).toBe('CASTELLANO');
      expect(service.normalizeLanguage('UN LUGAR EN SILENCIO')).toBe(
        'CASTELLANO',
      );
      expect(service.normalizeLanguage('UN LUGAR EN SILENCIO 2D CAST')).toBe(
        'CASTELLANO',
      );
      expect(service.normalizeLanguage('THE SUBSTANCE 2D CAST')).toBe(
        'CASTELLANO',
      );
    });
  });
});
