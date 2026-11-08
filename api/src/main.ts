import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureHttpApp } from './common/config/app-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureHttpApp(app);

  // Setup Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cine Radar API')
    .setDescription(
      'API REST de agregación y cartelera de cines en Argentina. Conecta las funciones de Cinemark Hoyts, Cinépolis, Showcase, Cinema Center, Atlas Cines y Multiplex.',
    )
    .setVersion('1.0')
    .addTag(
      'movies',
      'Cartelera actual, filtros de zona/cadena, cines cercanos y próximos estrenos',
    )
    .addTag('scraper', 'Endpoints administrativos de recolección de cartelera')
    .addTag('health', 'Monitoreo de estado del servicio')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'Clave API de administrador para ejecutar scrapers',
      },
      'admin-api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Cine Radar API | Documentación Swagger',
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`Cine Radar API running on: http://localhost:${port}`);
  console.log(`Swagger Docs available at: http://localhost:${port}/docs`);
}
void bootstrap();
