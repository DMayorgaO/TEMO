import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async health() {
    const result = await this.db.query<{ now: Date }>('select now()');

    return {
      status: 'ok',
      database: 'ok',
      serverTime: result.rows[0]?.now,
    };
  }
}

