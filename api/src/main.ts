import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. HELMET: Protege contra vulnerabilidades web conocidas configurando cabeceras HTTP adecuadas
  app.use(helmet());

  // 2. CORS: Permite que el Frontend (Next.js) hable con el Backend
  // Por ahora dejamos '*' (todos), luego lo cerramos solo a tu dominio
  app.enableCors({
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 3. VALIDACIÓN GLOBAL:
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina propiedades que no estén en el DTO
      forbidNonWhitelisted: true, // Tira error si mandan basura extra (TU ERROR ACTUAL)
      transform: true, // <--- ESTO ES LO QUE FALTABA: Convierte "10" a 10 automáticamente
      transformOptions: {
        enableImplicitConversion: true, // Ayuda extra para convertir tipos
      },
    }),
  );

  await app.listen(3000);
}
bootstrap();