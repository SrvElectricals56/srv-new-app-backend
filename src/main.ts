import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  // Body size limit — must be set BEFORE helmet/compression
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CORS must be enabled BEFORE helmet
  const corsOrigins = configService.get('CORS_ORIGIN')?.split(',') || ['http://localhost:3000'];
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow mobile apps (no origin) and listed origins
      if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all in development; restrict in production
      }
    },
    credentials: configService.get('CORS_CREDENTIALS') === 'true',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Security (after CORS so helmet doesn't override CORS headers)
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(compression());

  // Global prefix
  const apiPrefix = configService.get('API_PREFIX') || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // Global exception filter — converts DB errors to readable messages
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe
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

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('SRV Electricals Admin API')
    .setDescription('Complete API documentation for SRV Electricals Admin Panel Backend')
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

  // Root redirect → Swagger docs
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req: any, res: any) => {
    res.redirect('/api/docs');
  });

  // Health check endpoint
  expressApp.get('/health', (_req: any, res: any) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: configService.get('NODE_ENV'),
      version: '1.0.0'
    });
  });

  // Serve uploaded files as static assets
  expressApp.use('/uploads', require('express').static(join(process.cwd(), 'uploads')));

  const port = configService.get('PORT') || 3001;
  const host = configService.get('HOST') || '0.0.0.0'; // Bind to all interfaces
  await app.listen(port, host);

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   🚀 SRV Electricals Admin Backend API                   ║
  ║                                                           ║
  ║   Server running on: http://localhost:${port}              ║
  ║   Network access: http://10.255.222.231:${port}           ║
  ║   API Docs: http://localhost:${port}/api/docs             ║
  ║   Environment: ${configService.get('NODE_ENV')}                      ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
