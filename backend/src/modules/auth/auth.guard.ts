import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser, AuthService } from './auth.service';
import { IS_PUBLIC_ENDPOINT } from './public.decorator';

type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
  route?: { path?: string };
  user?: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = String(request.headers.authorization ?? '');
    const matched = /^Bearer ([A-Za-z0-9_.-]{1,4096})$/.exec(authorization);
    if (!matched) {
      throw new UnauthorizedException('Debe iniciar sesion.');
    }

    request.user = await this.auth.validateAccessToken(matched[1]);
    const path = request.route?.path ?? request.url?.split('?')[0] ?? '';
    const basicAccess = new Set(['GET /api/auth/me', 'POST /api/auth/change-password', 'POST /api/auth/logout']);
    const basic = basicAccess.has(`${request.method} ${path}`);
    if (!basic && !['JEFA', 'CAJERO', 'TRANSFERISTA'].includes(request.user.roleCode)) {
      throw new ForbiddenException('Este perfil no tiene acceso operativo configurado.');
    }
    if (request.user.mustChangePassword && !basic) {
      throw new ForbiddenException('Debe cambiar su contrasena antes de continuar.');
    }
    return true;
  }
}
