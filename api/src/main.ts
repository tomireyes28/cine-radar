import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { buildCorsOptions } from './common/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure Helmet with contentSecurityPolicy relaxed for Swagger UI assets
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors(buildCorsOptions(process.env.FRONTEND_URL));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Setup Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cine Radar API')
    .setDescription(
      'API REST de agregación y cartelera de cines en Argentina. Conecta en tiempo real las funciones de Cinemark Hoyts, Cinépolis, Showcase, Cinema Center, Atlas Cines y Multiplex.',
    )
    .setVersion('1.0')
    .addTag('movies', 'Cartelera actual, filtros de zona/cadena, cines cercanos y próximos estrenos')
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

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Cine Radar API running on: http://localhost:${port}`);
  console.log(`Swagger Docs available at: http://localhost:${port}/docs`);
}
void bootstrap();
