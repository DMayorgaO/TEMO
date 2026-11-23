import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../modules/auth/auth.service';
import { requireSessionVersion } from './session-version';

// Runs after the global AuthGuard. Record ownership and live write authorization
// remain mandatory in the services; this only enforces the HTTP boundary.
export class OperationalRouteGuard implements CanActivate {
  constructor(private readonly roles: readonly string[], private readonly queryHandlers: readonly string[] = []) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; query?: Record<string, unknown> }>();
    const user = request.user;
    if (!user || user.mustChangePassword || !this.roles.includes(user.roleCode)) {
      throw new ForbiddenException('Su perfil no permite esta operacion.');
    }
    requireSessionVersion(user.sessionVersion);
    // Only the named handlers have their own strict query contract.
    if (!this.queryHandlers.includes(context.getHandler().name) && Object.keys(request.query ?? {}).length) {
      throw new BadRequestException('Esta operacion no admite parametros de consulta.');
    }
    return true;
  }
}
