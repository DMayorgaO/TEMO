import { CallHandler, ExecutionContext, Logger, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs';
import { DatabaseService } from '../../modules/database/database.service';
import { DeniedAccessAudit } from './denied-access-audit';

const sensitiveRoutes = new Set([
  '/api/catalogs/usuarios', '/api/catalogs/roles', '/api/catalogs/cuentas-bancarias',
  '/api/catalogs/auditoria', '/api/catalogs/auditoria/:id',
  '/api/transactions', '/api/transactions/:id/detail', '/api/transactions/:id/group-detail',
  '/api/transactions/pending', '/api/transactions/pending/:id/payments',
  '/api/shifts', '/api/shifts/current', '/api/shifts/:id', '/api/shifts/dashboard',
  '/api/transfers', '/api/transfers/:id', '/api/directory', '/api/directory/:id',
  '/api/dollar-purchases',
]);

export class SensitiveReadInterceptor implements NestInterceptor {
  private readonly audit: DeniedAccessAudit;
  private readonly logger = new Logger(SensitiveReadInterceptor.name);

  constructor(db: DatabaseService) {
    this.audit = new DeniedAccessAudit(db, 'LECTURA_SENSIBLE');
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<{
      method: string; user?: { id: string }; ip?: string; baseUrl?: string;
      route?: { path?: string }; params?: { id?: string };
    }>();
    const route = typeof request.route?.path === 'string' ? `${request.baseUrl ?? ''}${request.route.path}` : '';
    if (request.method !== 'GET' || !request.user?.id || !sensitiveRoutes.has(route)) return next.handle();
    const id = request.user.id;
    return next.handle().pipe(tap({ next: () => {
      void this.audit.record(id, 'GET', route, request.ip ?? '', request.params?.id)
        .catch(() => this.logger.warn('No se pudo persistir un evento de lectura sensible.'));
    } }));
  }
}
