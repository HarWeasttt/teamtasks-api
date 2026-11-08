import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Shared between main.ts and e2e tests, so tests run against
 * exactly the same pipes/filters as production.
 */
export function configureApp(app: INestApplication): void {
  // behind a reverse proxy: use X-Forwarded-For so rate limiting sees real client IPs
  (app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set(
    'trust proxy',
    1,
  );
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? '*' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // ...and reject requests that send them
      transform: true, // turn plain JSON into DTO class instances (and query strings into numbers)
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('TeamTasks API')
    .setDescription(
      'Team task tracker: workspaces with roles, projects, tasks with filtering and pagination, comments. ' +
        'Authorize with the `accessToken` returned by /auth/login.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
