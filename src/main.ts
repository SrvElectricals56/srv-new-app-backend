import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as compression from 'compression';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  const dataSource = app.get(DataSource);

  // The JSON limit is intentionally smaller than upload limits. Large images,
  // PDFs, and videos must use the guarded multipart upload endpoints.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  const bodyLimit = configService.get<string>('BODY_LIMIT') || '10mb';
  app.use(
    express.json({
      limit: bodyLimit,
      verify: (req: any, _res: any, buffer: Buffer) => {
        if (req.originalUrl?.includes('/payments/razorpay/webhook')) {
          req.rawBody = Buffer.from(buffer);
        }
      },
    }),
  );
  app.use(express.urlencoded({ limit: bodyLimit, extended: true }));

  const corsOrigins = (
    configService.get<string>('CORS_ORIGIN') || 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowAllCors = corsOrigins.includes('*');
  const isDevelopment = configService.get<string>('NODE_ENV') !== 'production';
  const serverHost = configService.get<string>('SERVER_HOST');
  const isAllowedDevOrigin = (origin: string) => {
    if (!isDevelopment) return false;
    try {
      const { hostname, protocol } = new URL(origin);
      const devHosts = new Set(['localhost', '127.0.0.1', '::1']);
      if (serverHost) devHosts.add(serverHost);
      return protocol === 'http:' && devHosts.has(hostname);
    } catch {
      return false;
    }
  };
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow mobile apps (no origin) and explicitly configured web origins only.
      if (!origin || allowAllCors || corsOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: configService.get('CORS_CREDENTIALS') === 'true',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());

  const apiPrefix = configService.get('API_PREFIX') || 'api/v1';
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED') === 'true' ||
    (configService.get<string>('SWAGGER_ENABLED') !== 'false' &&
      configService.get<string>('NODE_ENV') !== 'production');

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('SRV Electricals Admin API')
      .setDescription(
        'Complete API documentation for SRV Electricals Admin Panel Backend',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'Admin authentication endpoints')
      .addTag('Electricians', 'Electrician management')
      .addTag('Dealers', 'Dealer management')
      .addTag('Products', 'Product catalog management')
      .addTag('QR Codes', 'QR code generation and management')
      .addTag('Scans', 'Scan history and tracking')
      .addTag('Redemptions', 'Redemption requests management')
      .addTag('Gifts', 'Gift products and orders')
      .addTag('Notifications', 'Push notification management')
      .addTag('Offers', 'Promotional offers')
      .addTag('Banners', 'App banner management')
      .addTag('Analytics', 'Analytics and reports')
      .addTag('Wallet', 'Wallet and transactions')
      .addTag('Finance', 'Financial operations')
      .addTag('Support', 'Customer support and enquiries')
      .addTag('Settings', 'Application settings')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req: any, res: any) => {
    if (swaggerEnabled) return res.redirect('/api/docs');
    return res.status(200).json({ name: 'SRV Electricals API', status: 'ok' });
  });

  expressApp.get('/health', async (_req: any, res: any) => {
    try {
      await dataSource.query('SELECT 1');
      return res.status(200).json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: configService.get('NODE_ENV'),
        version: '1.0.0',
      });
    } catch (error) {
      logger.error('Database health check failed', error as Error);
      return res.status(503).json({
        status: 'degraded',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  });

  expressApp.use(
    '/uploads',
    require('express').static(join(process.cwd(), 'uploads')),
  );

  const port = configService.get('PORT') || 3001;
  const host = configService.get('HOST') || '0.0.0.0';
  app.enableShutdownHooks();
  await app.listen(port, host);

  logger.log(`API listening on http://${host}:${port}`);
  if (swaggerEnabled) {
    logger.log(`Swagger available at http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((error) => {
  new Logger('Bootstrap').error('Application failed to start', error);
  process.exitCode = 1;
});
