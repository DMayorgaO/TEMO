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
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Debe iniciar sesion.');
    }

    request.user = await this.auth.validateAccessToken(token);
    if (
      request.user.mustChangePassword &&
      !request.url?.startsWith('/api/auth/change-password') &&
      !request.url?.startsWith('/api/auth/me')
    ) {
      throw new ForbiddenException('Debe cambiar su contrasena antes de continuar.');
    }
    return true;
  }
}
