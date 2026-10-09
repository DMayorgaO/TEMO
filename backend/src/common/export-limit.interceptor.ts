import { CallHandler, ExecutionContext, HttpException, NestInterceptor } from '@nestjs/common';
import { defer, finalize } from 'rxjs';

const routes = new Set(['/api/transactions/export', '/api/shifts/export',
  '/api/shifts/dashboard/export', '/api/catalogs/export/:resource', '/api/catalogs/auditoria/exportaciones']);

export class ExportLimitInterceptor implements NestInterceptor {
  private readonly actors = new Map<string, { expires: number; count: number; active: number }>();

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<{
      method: string; user?: { id: string }; route?: { path?: string }; baseUrl?: string;
    }>();
    const route = `${request.baseUrl ?? ''}${request.route?.path ?? ''}`;
    if (request.method !== 'POST' || !request.user?.id || !routes.has(route)) return next.handle();
    const now = Date.now();
    for (const [id, state] of this.actors) if (state.expires <= now && !state.active) this.actors.delete(id);
    let state = this.actors.get(request.user.id);
    if (!state) {
      if (this.actors.size >= 1000) throw new HttpException('Exportaciones ocupadas. Intente nuevamente en un minuto.', 429);
      state = { expires: now + 60000, count: 0, active: 0 };
      this.actors.set(request.user.id, state);
    }
    if (state.expires <= now) { state.expires = now + 60000; state.count = 0; }
    if (state.count >= 30 || state.active >= 2) {
      throw new HttpException('Espere antes de solicitar otra exportacion. Puede seguir registrando transacciones.', 429);
    }
    state.count++; state.active++;
    const actor = state;
    return defer(() => next.handle()).pipe(finalize(() => { actor.active--; }));
  }
}
