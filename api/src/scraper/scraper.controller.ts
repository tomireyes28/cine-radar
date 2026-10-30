import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ScraperOrchestratorService } from './services/scraper-orchestrator.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('scraper')
@UseGuards(ApiKeyGuard)
export class ScraperController {
  constructor(
    private readonly orchestrator: ScraperOrchestratorService,
  ) {}

  @Post('run-all')
  async runAll() {
    return this.orchestrator.runAll();
  }

  @Post(':chainKey')
  async runByChain(@Param('chainKey') chainKey: string) {
    return this.orchestrator.runByChainKey(chainKey);
  }
}
