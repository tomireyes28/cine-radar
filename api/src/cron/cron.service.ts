import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CinemarkService } from '../scraper/cinemark/cinemark.service';
import { MultiplexService } from '../scraper/multiplex/multiplex.service';
import { CinepolisService } from '../scraper/cinepolis/cinepolis.service';
import { ShowcaseService } from '../scraper/showcase/showcase.service';
import { AtlasService } from '../scraper/atlas/atlas.service';
import { CinemaCenterService } from '../scraper/cinemacenter/cinemacenter.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly cinemarkService: CinemarkService,
    private readonly multiplexService: MultiplexService,
    private readonly cinepolisService: CinepolisService,
    private readonly showcaseService: ShowcaseService,
    private readonly atlasService: AtlasService,
    private readonly cinemaCenterService: CinemaCenterService,
    private readonly prisma: PrismaService
  ) {}

  // Se ejecuta todos los días a las 04:00 AM
  @Cron('0 4 * * *')
  async handleDailyScraping() {
    this.logger.log('🌅 Iniciando CRON JOB de actualización de cartelera...');

    // 1. Limpieza opcional: Borrar funciones viejas para no llenar la DB
    await this.cleanupOldShowtimes();

    // 2. Ejecución Secuencial (Uno por uno para no saturar el servidor)
    try {
      await this.cinemarkService.runScraper();
    } catch (e) { this.logger.error('Fallo Cinemark', e); }

    try {
      await this.multiplexService.scrapeBillboard();
    } catch (e) { this.logger.error('Fallo Multiplex', e); }

    try {
      await this.cinepolisService.runScraper();
    } catch (e) { this.logger.error('Fallo Cinepolis', e); }

    try {
      await this.showcaseService.runScraper();
    } catch (e) { this.logger.error('Fallo Showcase', e); }

    try {
      await this.atlasService.runScraper();
    } catch (e) { this.logger.error('Fallo Atlas', e); }

    try {
      await this.cinemaCenterService.runScraper();
    } catch (e) { this.logger.error('Fallo CinemaCenter', e); }

    this.logger.log('✅ CRON JOB FINALIZADO: Cartelera actualizada.');
  }

  private async cleanupOldShowtimes() {
    // Borrar funciones de ayer para atrás
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const result = await this.prisma.showtime.deleteMany({
      where: {
        dateTime: { lt: yesterday }
      }
    });
    this.logger.log(`🧹 Limpieza: Se eliminaron ${result.count} funciones antiguas.`);
  }
}