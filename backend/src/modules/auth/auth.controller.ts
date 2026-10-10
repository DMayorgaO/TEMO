import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { changePasswordSchema, loginSchema, mfaVerifySchema, parseAuthBody, profilePhotoSchema,
  recoveryConfirmSchema, recoveryRequestSchema } from './auth.schemas';

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
  login(@Body() body: unknown, @Req() request: HttpRequest) {
    const input = parseAuthBody(loginSchema, body);
    return this.auth.login(
      input.username,
      input.password,
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  // Inicia una recuperación sin revelar si el usuario o correo existe.
  @Public()
  @Post('password-recovery/request')
  requestPasswordRecovery(@Body() body: unknown, @Req() request: HttpRequest) {
    const input = parseAuthBody(recoveryRequestSchema, body);
    return this.auth.requestPasswordRecovery(
      input.identifier,
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  // Valida el código recibido y establece una nueva contraseña para Administrador.
  @Public()
  @Post('password-recovery/confirm')
  confirmPasswordRecovery(@Body() body: unknown, @Req() request: HttpRequest) {
    const input = parseAuthBody(recoveryConfirmSchema, body);
    return this.auth.confirmPasswordRecovery(
      input.identifier,
      input.code,
      input.newPassword,
      request.ip ?? '',
      String(request.headers['user-agent'] ?? ''),
    );
  }

  @Get('me')
  session(@Req() request: HttpRequest) {
    return this.auth.session(request.user as import('./auth.service').AuthenticatedUser);
  }

  @Public()
  @Post('mfa/verify')
  verifyMfa(@Body() body: unknown, @Req() request: HttpRequest) {
    const input = parseAuthBody(mfaVerifySchema, body);
    return this.auth.verifyMfa(input.challenge, input.code, input.recoveryCode,
      request.ip ?? '', String(request.headers['user-agent'] ?? ''));
  }

  @Post('change-password')
  changePassword(@Body() body: unknown, @Req() request: HttpRequest) {
    const input = parseAuthBody(changePasswordSchema, body);
    return this.auth.changePassword(
      request.user as import('./auth.service').AuthenticatedUser,
      input.currentPassword, input.newPassword,
      request.ip ?? '', String(request.headers['user-agent'] ?? ''),
    );
  }

  // Actualiza la fotografia del usuario autenticado sin aceptar archivos en el servidor.
  @Post('profile-photo')
  changeProfilePhoto(@Body() body: unknown, @Req() request: HttpRequest) {
    const input = parseAuthBody(profilePhotoSchema, body);
    return this.auth.changeProfilePhoto(
      request.user as import('./auth.service').AuthenticatedUser,
      input.photoDataUrl,
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
