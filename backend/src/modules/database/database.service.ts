import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString =
      config.get<string>('DATABASE_URL') ??
      'postgresql://temo:temo_local_password@localhost:55432/temo';
    const useSsl = config.get<string>('DATABASE_SSL', 'false').toLowerCase() === 'true';
    const sslCaPath = config.get<string>('DATABASE_SSL_CA_PATH', '').trim();
    const sslCaBase64 = config.get<string>('DATABASE_SSL_CA_BASE64', '').trim();
    const sslCa = sslCaBase64
      ? Buffer.from(sslCaBase64, 'base64').toString('utf8')
      : sslCaPath
        ? readFileSync(sslCaPath, 'utf8')
        : undefined;
    const maxConnections = Number(config.get<string>('DATABASE_POOL_MAX', '10'));

    this.pool = new Pool({
      connectionString,
      application_name: 'temo-backend',
      options: '-c search_path=temo,extensions,public',
      max: Number.isFinite(maxConnections) ? Math.max(1, Math.min(maxConnections, 20)) : 10,
      ssl: useSsl ? { ca: sslCa, rejectUnauthorized: true } : undefined,
    });
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
