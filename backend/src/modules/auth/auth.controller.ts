import { Body, Controller, Post } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('login')
  login(@Body() body: { username: string }) {
    return {
      message: 'Login pendiente de implementar con hash de contrasena y JWT.',
      username: body.username,
    };
  }
}

