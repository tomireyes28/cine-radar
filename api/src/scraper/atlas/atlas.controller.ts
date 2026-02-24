import { Controller, Get } from '@nestjs/common';
import { AtlasService } from './atlas.service';

@Controller('scraper/atlas')
export class AtlasController {
  constructor(private readonly atlasService: AtlasService) {}

  @Get('test')
  async testScraper() {
    await this.atlasService.runScraper();
    return {
      success: true,
      message: '✅ Scraper de Atlas finalizado.'
    };
  }
}