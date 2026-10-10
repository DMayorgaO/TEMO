import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { buildDatabaseOptions } from '../../config/database.config';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(config: ConfigService) {
    this.pool = new Pool(buildDatabaseOptions(config));
    // Idle disconnections are emitted outside query promises; do not log connection details.
    this.pool.on('error', () => {
      this.logger.warn('Se descarto una conexion inactiva de base de datos.');
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
    let discard = false;
    const onClientError = () => {
      discard = true;
      this.logger.warn('Se interrumpio una conexion transaccional de base de datos.');
    };
    client.on('error', onClientError);
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      catch { discard = true; }
      throw error;
    } finally {
      client.release(discard);
      client.removeListener('error', onClientError);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
