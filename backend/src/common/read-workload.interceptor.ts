import { CallHandler, ExecutionContext, HttpException, NestInterceptor } from '@nestjs/common';
import { defer, finalize } from 'rxjs';

const reports = new Set(['/api/transactions','/api/shifts/dashboard','/api/dollar-purchases']);

export class ReadWorkloadInterceptor implements NestInterceptor {
  private readonly activeActors = new Map<string, number>();
  private active = 0;

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string; user?: { id: string }; baseUrl?: string; route?: { path?: string };
    }>();
    const route = `${request.baseUrl ?? ''}${request.route?.path ?? ''}`;
    if (request.method !== 'GET' || !request.user?.id || !reports.has(route)) return next.handle();
    const actor = request.user.id;

    // Bound only concurrent heavy reads, not financial writes or records per day.
    return defer(() => {
      if ((this.activeActors.get(actor) ?? 0) >= 4 || this.active >= 16) {
        http.getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Retry-After','1');
        throw new HttpException('Hay consultas en curso. Espere un momento antes de actualizar este reporte. Puede seguir registrando operaciones.',429);
      }
      this.active++;
      this.activeActors.set(actor,(this.activeActors.get(actor) ?? 0)+1);
      return defer(() => next.handle()).pipe(finalize(() => {
        this.active--;
        const remaining = (this.activeActors.get(actor) ?? 1)-1;
        if (remaining > 0) this.activeActors.set(actor,remaining);
        else this.activeActors.delete(actor);
      }));
    });
  }
}
