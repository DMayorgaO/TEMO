import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { requireSessionVersion } from '../../common/session-version';
import { AuthenticatedUser } from './auth.service';

const publicHandlers = new Set(['login', 'requestPasswordRecovery', 'confirmPasswordRecovery', 'verifyMfa']);
const basicHandlers = new Set(['session', 'changePassword', 'logout']);

// AuthGuard still validates protected sessions. Public access is limited to the
// four established authentication entry points, never inferred for new routes.
export class AuthRouteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler().name;
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; query?: Record<string, unknown>; body?: unknown }>();
    if (!publicHandlers.has(handler) && !basicHandlers.has(handler) && handler !== 'changeProfilePhoto') {
      throw new ForbiddenException('Operacion no autorizada.');
    }
    if (!publicHandlers.has(handler)) {
      if (!request.user) throw new UnauthorizedException('Debe iniciar sesion.');
      requireSessionVersion(request.user.sessionVersion);
      if (!basicHandlers.has(handler) && (request.user.mustChangePassword || !['JEFA', 'CAJERO', 'TRANSFERISTA'].includes(request.user.roleCode))) {
        throw new ForbiddenException('Su perfil no permite esta operacion.');
      }
    }
    if (Object.keys(request.query ?? {}).length) throw new BadRequestException('Esta operacion no admite parametros de consulta.');
    if (['session', 'logout'].includes(handler) && request.body !== undefined && (
      request.body === null || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).length
    )) throw new BadRequestException('Esta operacion no admite campos adicionales.');
    return true;
  }
}
