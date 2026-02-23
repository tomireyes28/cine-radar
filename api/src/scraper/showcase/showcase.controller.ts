import { Controller, Get } from '@nestjs/common';
import { ShowcaseService } from './showcase.service';

@Controller('scraper/showcase')
export class ShowcaseController {
  constructor(private readonly showcaseService: ShowcaseService) {}

  @Get('test')
  async testScraper() {
    await this.showcaseService.runScraper();
    
    return {
      success: true,
      message: '✅ Scraper de Showcase finalizado. Revisá la consola.'
    };
  }
}