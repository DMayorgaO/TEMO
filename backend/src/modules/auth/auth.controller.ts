import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

type LoginRequest = {
  username?: unknown;
  password?: unknown;
};
type ChangePasswordRequest = { currentPassword?: unknown; newPassword?: unknown };
type ChangeProfilePhotoRequest = { photoDataUrl?: unknown };
type RequestPasswordRecoveryRequest = { identifier?: unknown };
type ConfirmPasswordRecoveryRequest = { identifier?: unknown; code?: unknown; newPassword?: unknown };

type HttpRequest = {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginRequest, @Req() request: HttpRequest) {
    return this.auth.login(
      String(body.username ?? ''),
      String(body.password ?? ''),
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  // Inicia una recuperación sin revelar si el usuario o correo existe.
  @Public()
  @Post('password-recovery/request')
  requestPasswordRecovery(@Body() body: RequestPasswordRecoveryRequest, @Req() request: HttpRequest) {
    return this.auth.requestPasswordRecovery(
      String(body.identifier ?? ''),
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  // Valida el código recibido y establece una nueva contraseña para la Jefa.
  @Public()
  @Post('password-recovery/confirm')
  confirmPasswordRecovery(@Body() body: ConfirmPasswordRecoveryRequest, @Req() request: HttpRequest) {
    return this.auth.confirmPasswordRecovery(
      String(body.identifier ?? ''),
      String(body.code ?? ''),
      String(body.newPassword ?? ''),
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  @Get('me')
  session(@Req() request: HttpRequest) {
    return { user: request.user };
  }

  @Post('change-password')
  changePassword(@Body() body: ChangePasswordRequest, @Req() request: HttpRequest) {
    return this.auth.changePassword(
      request.user as import('./auth.service').AuthenticatedUser,
      String(body.currentPassword ?? ''), String(body.newPassword ?? ''),
      request.ip ?? '', String(request.headers['user-agent'] ?? ''),
    );
  }

  // Actualiza la fotografia del usuario autenticado sin aceptar archivos en el servidor.
  @Post('profile-photo')
  changeProfilePhoto(@Body() body: ChangeProfilePhotoRequest, @Req() request: HttpRequest) {
    return this.auth.changeProfilePhoto(
      request.user as import('./auth.service').AuthenticatedUser,
      String(body.photoDataUrl ?? ''),
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  @Post('logout')
  logout(@Req() request: HttpRequest) {
    return this.auth.logout(
      request.user as import('./auth.service').AuthenticatedUser,
      request.ip ?? '', String(request.headers['user-agent'] ?? ''),
    );
  }
}
