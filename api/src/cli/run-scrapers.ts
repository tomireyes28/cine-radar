import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ScraperOrchestratorService } from '../scraper/services/scraper-orchestrator.service';
import { parseCliChainArg } from './cli-args.util';

async function bootstrap() {
  const targetChain = parseCliChainArg(
    process.argv.slice(2),
    process.env.CHAIN_KEY,
  );

  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const orchestrator = appContext.get(ScraperOrchestratorService);

    if (targetChain) {
      const summary = await orchestrator.runByChainKey(targetChain);
      console.log('📊 Resumen de cadena:', JSON.stringify(summary, null, 2));
    } else {
      const summary = await orchestrator.runAll();
      console.log('📊 Resumen general:', JSON.stringify(summary, null, 2));
    }
  } finally {
    await appContext.close();
  }
}

bootstrap()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('❌ Error fatal en CLI de scraping:', err);
    process.exit(1);
  });
