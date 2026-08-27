import { z } from 'zod';

const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'pilot', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  AUTH_SECRET: z.string().min(32),
  AUTH_TOKEN_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  CORS_ORIGINS: z.string().default(''),
});

export function validateEnvironment(config: Record<string, unknown>) {
  const parsed = environmentSchema.parse(config);
  if (parsed.APP_ENV !== 'development') {
    if (parsed.DATABASE_SSL !== 'true') {
      throw new Error('Los ambientes piloto y produccion requieren DATABASE_SSL=true.');
    }
    if (!parsed.CORS_ORIGINS.trim()) {
      throw new Error('Los ambientes piloto y produccion requieren CORS_ORIGINS explicito.');
    }
    if (/localhost|temo_local_password/i.test(parsed.DATABASE_URL)) {
      throw new Error('Un ambiente remoto no puede utilizar la base de datos local.');
    }
  }
  return { ...config, ...parsed };
}
