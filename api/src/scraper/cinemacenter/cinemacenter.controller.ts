import { Controller, Get } from '@nestjs/common';
import { CinemaCenterService } from './cinemacenter.service';

@Controller('scraper/cinemacenter')
export class CinemaCenterController {
  constructor(private readonly service: CinemaCenterService) {}

  @Get('test')
  async testScraper() {
    await this.service.runScraper();
    return { success: true, message: '✅ Scraper de Cinema Center disparado.' };
  }
}