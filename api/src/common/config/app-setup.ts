import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { buildCorsOptions } from './cors.config';

export function configureHttpApp(
  app: INestApplication,
  frontendUrlEnv = process.env.FRONTEND_URL,
): void {
  // Configure Helmet with contentSecurityPolicy relaxed for Swagger UI assets
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors(buildCorsOptions(frontendUrlEnv));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
