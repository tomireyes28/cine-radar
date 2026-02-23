import { Controller, Get } from '@nestjs/common';
import { CinemarkService } from './cinemark.service';

@Controller('scraper/cinemark')
export class CinemarkController {
  constructor(private readonly cinemarkService: CinemarkService) {}

  @Get('test')
  async runTest() {
    return this.cinemarkService.runScraper();
  }
}