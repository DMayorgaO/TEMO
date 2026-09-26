import { ConfigService } from '@nestjs/config';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/errors/app-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? config.get<number>('BACKEND_PORT', 4000);
  const configuredOrigins = config.get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const server = app.getHttpAdapter().getInstance() as { set: (key: string, value: unknown) => void };
  server.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  // Incluso los rechazos tempranos deben ser legibles desde el frontend.
  app.enableCors({
    origin: configuredOrigins.length ? configuredOrigins : true,
    credentials: true,
  });
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: false, limit: '64kb' }));
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { statusCode: 429, message: 'Demasiados intentos. Intente nuevamente en 15 minutos.' },
  }));
  // Limita solicitudes y validaciones de recuperación para evitar abuso del correo y de códigos.
  app.use('/api/auth/password-recovery', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { statusCode: 429, message: 'Demasiados intentos de recuperación. Espere 15 minutos.' },
  }));
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1200,
    skip: (req) => req.method === 'GET' || req.method === 'HEAD',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { statusCode: 429, message: 'Se alcanzo el limite temporal de operaciones de esta conexion. Espere antes de volver a guardar. No cierre el formulario.' },
  }));
  // Las consultas periodicas de varios cajeros comparten la IP de la sucursal.
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12000,
    skip: (req) => req.method !== 'GET' && req.method !== 'HEAD',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { statusCode: 429, message: 'Se alcanzo el limite temporal de consultas de esta conexion. Espere unos minutos; sus datos ingresados no deben descartarse.' },
  }));
  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
  app.useGlobalFilters(new AppExceptionFilter());

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
