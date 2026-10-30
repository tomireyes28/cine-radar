import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ScraperOrchestratorService } from '../scraper/services/scraper-orchestrator.service';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const orchestrator = appContext.get(ScraperOrchestratorService);
    const chainArg = process.argv[2]?.trim();

    if (chainArg) {
      const summary = await orchestrator.runByChainKey(chainArg);
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
  .catch((err) => {
    console.error('❌ Error fatal en CLI de scraping:', err);
    process.exit(1);
  });
