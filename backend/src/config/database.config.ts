import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';
import { z } from 'zod';

export const databaseRuntimeSchema = z.object({
  DATABASE_URL: z.string().min(1).refine((value) => {
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname)
        && !url.search && !url.hash;
    } catch { return false; }
  }, 'DATABASE_URL debe ser una URL PostgreSQL sin parametros ni fragmentos; configure TLS por separado.'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  DATABASE_LOCK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
});

export function buildDatabaseOptions(config: Pick<ConfigService, 'get'>): PoolConfig {
  const input = Object.fromEntries(Object.keys(databaseRuntimeSchema.shape).map(key => [key, config.get(key)]));
  const parsed = databaseRuntimeSchema.safeParse(input);
  if (!parsed.success) throw new Error('Configuracion de base de datos invalida; revise URL, TLS y limites.');
  const value = parsed.data;
  if (config.get<string>('APP_ENV', 'development') !== 'development' && value.DATABASE_SSL !== 'true') {
    throw new Error('La conexion remota requiere DATABASE_SSL=true.');
  }
  const caPath = config.get<string>('DATABASE_SSL_CA_PATH', '').trim();
  const caBase64 = config.get<string>('DATABASE_SSL_CA_BASE64', '').trim();
  if (caPath && caBase64) throw new Error('Configure una sola fuente del certificado de base de datos.');
  let ca: string | undefined;
  if (value.DATABASE_SSL === 'true') {
    try {
      if (caBase64) {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(caBase64)) throw new Error();
        ca = Buffer.from(caBase64, 'base64').toString('utf8');
      } else if (caPath) ca = readFileSync(caPath, 'utf8');
      if (ca !== undefined && !ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error();
    } catch { throw new Error('No fue posible cargar el certificado de base de datos.'); }
  }
  return {
    connectionString: value.DATABASE_URL,
    application_name: 'temo-backend', options: '-c search_path=temo,extensions,public',
    max: value.DATABASE_POOL_MAX,
    connectionTimeoutMillis: value.DATABASE_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
    statement_timeout: value.DATABASE_STATEMENT_TIMEOUT_MS,
    lock_timeout: value.DATABASE_LOCK_TIMEOUT_MS,
    idle_in_transaction_session_timeout: value.DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
    ssl: value.DATABASE_SSL === 'true' ? { ca, rejectUnauthorized: true } : false,
  };
}
