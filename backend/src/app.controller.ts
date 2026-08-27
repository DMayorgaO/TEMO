import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return {
      service: 'TEMO API',
      status: 'online',
      health: '/api/health',
    };
  }
}
