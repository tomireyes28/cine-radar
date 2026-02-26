import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  // 🔒 CORS BLINDADO: Solo tu Frontend puede pedir datos
  app.enableCors({
    origin: [
      'https://cinema-agenda-app.vercel.app', // Tu producción
      'http://localhost:3000' // Para que puedas seguir probando en tu PC sin romper nada
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Ahora sí podés poner true porque el origen es específico
  });

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

  // Puerto dinámico de Railway
  await app.listen(process.env.PORT || 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();