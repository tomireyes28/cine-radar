import { Controller, Get } from '@nestjs/common';
import { CinepolisService } from './cinepolis.service';

@Controller('scraper/cinepolis')
export class CinepolisController {
  constructor(private readonly cinepolisService: CinepolisService) {}

  @Get('test')
  async testScraper() {
    // Esto dispara la lógica que acabamos de crear
    await this.cinepolisService.runScraper();
    
    return {
      success: true,
      message: '✅ Scraper de Cinépolis finalizado. Revisá la terminal para ver los detalles.'
    };
  }
}