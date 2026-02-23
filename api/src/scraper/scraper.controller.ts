import { Controller, Get } from '@nestjs/common';
import { MultiplexService } from './multiplex/multiplex.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly multiplexService: MultiplexService) {}

  @Get('multiplex')
  async testMultiplex() {
    return await this.multiplexService.scrapeBillboard();
  }
}