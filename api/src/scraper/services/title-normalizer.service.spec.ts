import { TitleNormalizerService } from './title-normalizer.service';

describe('TitleNormalizerService', () => {
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
    it('identifies subtitled vs dubbed screenings accurately', () => {
      expect(service.normalizeLanguage('2D-Subtitulado')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('SUB')).toBe('SUBTITULADA');
      expect(service.normalizeLanguage('CASTELLANO')).toBe('CASTELLANO');
      expect(service.normalizeLanguage('ESP ESPAÑOL')).toBe('CASTELLANO');
    });
  });
});
