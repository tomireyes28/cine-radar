import { NestFactory } from '@nestjs/core';
import { ScraperWorkerModule } from '../scraper/scraper-worker.module';
import { ScraperOrchestratorService } from '../scraper/services/scraper-orchestrator.service';
import {
  parseCliChainArg,
  resolveFullRunExitCode,
  resolveSingleChainExitCode,
} from './cli-args.util';

async function bootstrap(): Promise<0 | 1> {
  const targetChain = parseCliChainArg(
    process.argv.slice(2),
    process.env.CHAIN_KEY,
  );

  const appContext = await NestFactory.createApplicationContext(
    ScraperWorkerModule,
    {
      logger: ['log', 'warn', 'error'],
    },
  );

  try {
    const orchestrator = appContext.get(ScraperOrchestratorService);

    if (targetChain) {
      const summary = await orchestrator.runByChainKey(targetChain, 'cli');
      console.log('📊 Resumen de cadena:', JSON.stringify(summary, null, 2));
      return resolveSingleChainExitCode(summary);
    }

    const summary = await orchestrator.runAll('cli');
    console.log('📊 Resumen general:', JSON.stringify(summary, null, 2));
    return resolveFullRunExitCode(summary);
  } finally {
    await appContext.close();
  }
}

bootstrap()
  .then((exitCode) => process.exit(exitCode))
  .catch((err: unknown) => {
    console.error('❌ Error fatal en CLI de scraping:', err);
    process.exit(1);
  });
