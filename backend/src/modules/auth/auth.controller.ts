import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

type LoginRequest = {
  username?: unknown;
  password?: unknown;
};

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

  @Get('me')
  session(@Req() request: HttpRequest) {
    return { user: request.user };
  }
}
