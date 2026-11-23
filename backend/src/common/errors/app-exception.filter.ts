import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { catalogHttpError, catalogPostgresError } from './error-catalog';
import { DatabaseService } from '../../modules/database/database.service';
import { DeniedAccessAudit } from './denied-access-audit';

type DatabaseError = Error & { code?: string; constraint?: string; detail?: string };
type HttpErrorBody = { code?: unknown; message?: unknown };
const publicCodes = new Map([
  ['TUR-SOL-409', 409], ['TRA-VER-409', 409], ['TRF-VER-409', 409],
  ['GEN-REQ-400', 400], ['GEN-REQ-413', 413], ['GEN-REQ-415', 415],
]);

function publicMessage(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.length > 0 && value.length <= 2000) return value;
  if (Array.isArray(value) && value.length > 0 && value.length <= 20
    && value.every(item => typeof item === 'string' && item.length <= 200)) return value.join(' ');
  return fallback;
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);
  private readonly deniedAudit?: DeniedAccessAudit;

  constructor(db?: DatabaseService) {
    if (db) this.deniedAudit = new DeniedAccessAudit(db);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = randomUUID().slice(0, 8).toUpperCase();
    const path = typeof request.route?.path === 'string' ? `${request.baseUrl || ''}${request.route.path}` : '/ruta-no-identificada';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const identity = (request as Request & { user?: { id: string } }).user;
      if (status === 403 && identity?.id && this.deniedAudit) {
        void this.deniedAudit.record(identity.id, request.method, path, request.ip ?? '')
          .catch(() => this.logger.warn('No se pudo persistir un evento de acceso denegado.'));
      }
      const body = exception.getResponse();
      const parsed: HttpErrorBody = typeof body === 'string' ? { message: body }
        : body && typeof body === 'object' && !Array.isArray(body) ? body as HttpErrorBody : {};
      const catalog = catalogHttpError(status, path);
      const code = typeof parsed.code === 'string' && publicCodes.get(parsed.code) === status ? parsed.code : catalog.code;
      const message = status >= 500 ? catalog.message : publicMessage(parsed.message, catalog.message);
      this.log(exception, request, requestId, code);
      response.status(status).json({
        statusCode: status,
        code,
        message,
        requestId,
        timestamp: new Date().toISOString(),
        path,
      });
      return;
    }

    const databaseError = exception as DatabaseError;
    const catalog = catalogPostgresError(databaseError?.code, path);
    this.log(exception, request, requestId, catalog.code);
    response.status(500).json({
      statusCode: 500,
      code: catalog.code,
      message: catalog.message,
      requestId,
      timestamp: new Date().toISOString(),
      path,
    });
  }

  private log(exception: unknown, request: Request, requestId: string, code: string) {
    const databaseError = exception as DatabaseError;
    this.logger.error(
      JSON.stringify({
        requestId,
        code,
        method: request.method,
        path: typeof request.route?.path === 'string' ? `${request.baseUrl || ''}${request.route.path}` : '/ruta-no-identificada',
        postgresCode: typeof databaseError?.code === 'string' && /^[0-9A-Z]{5}$/.test(databaseError.code)
          ? databaseError.code : undefined,
      }),
    );
  }
}
