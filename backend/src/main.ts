import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('BACKEND_PORT', 4000);

  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.setGlobalPrefix('api');

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
