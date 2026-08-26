import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { transferSchema, voidTransferSchema } from './transfers.schema';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  list(@Req() request: { user: AuthenticatedUser }) {
    return this.transfers.list(request.user);
  }

  @Get('context')
  context(@Req() request: { user: AuthenticatedUser }) {
    return this.transfers.context(request.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: { user: AuthenticatedUser }) {
    return this.transfers.detail(id, request.user);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: { user: AuthenticatedUser }) {
    const parsed = transferSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: 'Los datos de la transferencia no son validos.', errors: parsed.error.flatten() });
    return this.transfers.create(parsed.data, request.user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: { user: AuthenticatedUser }) {
    const parsed = transferSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ message: 'Los datos de la transferencia no son validos.', errors: parsed.error.flatten() });
    return this.transfers.update(id, parsed.data, request.user);
  }

  @Post(':id/void')
  void(@Param('id') id: string, @Body() body: unknown, @Req() request: { user: AuthenticatedUser }) {
    const parsed = voidTransferSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Debe indicar un motivo de anulacion.');
    return this.transfers.void(id, parsed.data.reason, request.user);
  }
}
