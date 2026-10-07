import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { ShiftsService } from './shifts.service';
import {
  closeShiftSchema,
  openShiftSchema,
  saveBalancesSchema,
  saveCashCountSchema,
  updateClosedShiftSchema,
  updateShiftSchema,
} from './shifts.schema';

type AuthenticatedRequest = { user: AuthenticatedUser };

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.shifts.list(request.user);
  }

  @Get('open')
  open(@Req() request: AuthenticatedRequest) {
    return this.shifts.open(request.user);
  }

  @Get('dashboard')
  dashboard(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('day') day: string | undefined, @Req() request: AuthenticatedRequest) {
    for (const value of [from, to, day]) {
      if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) throw new BadRequestException('Fecha invalida.');
    }
    if (Boolean(from) !== Boolean(to) || (from && to && (from > to || Date.parse(to)-Date.parse(from)>366*86400000))) throw new BadRequestException('Seleccione un rango de hasta 367 dias.');
    return this.shifts.dashboard(request.user, from, to, day);
  }

  @Get('current')
  current(@Req() request: AuthenticatedRequest) {
    return this.shifts.current(request.user);
  }

  @Get('notifications')
  notifications(@Req() request: AuthenticatedRequest) {
    return this.shifts.notifications(request.user);
  }

  @Post('notifications/:id/acknowledge')
  acknowledge(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.shifts.acknowledgeNotification(id, request.user);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.shifts.detail(id, request.user);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.shifts.create(this.parse(openShiftSchema, body), request.user);
  }

  // El cajero confirma con un solo paso el turno previamente alistado por el Administrador.
  @Post(':id/open-prepared')
  openPrepared(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.shifts.openPrepared(id, request.user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.shifts.update(id, this.parse(updateShiftSchema, body), request.user);
  }

  @Put(':id/closed')
  updateClosed(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.shifts.updateClosed(id, this.parse(updateClosedShiftSchema, body), request.user);
  }

  @Put(':id/cash-count')
  saveCashCount(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.shifts.saveCashCount(id, this.parse(saveCashCountSchema, body), request.user);
  }

  @Put(':id/account-balances')
  saveBalances(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(saveBalancesSchema, body);
    return this.shifts.saveBalances(id, input.balances, request.user);
  }

  @Post(':id/close-request')
  requestClose(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.shifts.requestClose(id, request.user);
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.shifts.close(id, this.parse(closeShiftSchema, body), request.user);
  }

  // Traduce rutas técnicas de Zod a un mensaje que identifica el campo rechazado.
  private parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path?: PropertyKey[]; message?: string }> } } }, value: unknown) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const details = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path?.map(String).join('.') || 'formulario'}: ${issue.message || 'valor inválido'}`)
        .join('; ');
      throw new BadRequestException({ message: `Datos inválidos. ${details}`, issues: parsed.error.issues });
    }
    return parsed.data;
  }
}
