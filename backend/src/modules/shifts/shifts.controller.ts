import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Req, UsePipes } from '@nestjs/common';
import { RecordIdPipe } from '../../common/record-id.pipe';
import { AuthenticatedUser } from '../auth/auth.service';
import { ShiftsService } from './shifts.service';
import { HandoversService } from './handovers.service';
import { z } from 'zod';
import { parseDashboardQuery } from '../../common/read-query';
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
@UsePipes(new RecordIdPipe())
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService, private readonly handovers: HandoversService) {}

  @Get('handovers')
  handoverList(@Req() request: AuthenticatedRequest) { return this.handovers.list(request.user); }

  @Get(':id/handover-candidates')
  handoverCandidates(@Param('id') id: string, @Req() request: AuthenticatedRequest) { return this.handovers.candidates(id,request.user); }

  @Get(':id/handover-preview')
  handoverPreview(@Param('id') id: string, @Req() request: AuthenticatedRequest) { return this.handovers.preview(id,request.user); }

  @Post(':id/handovers')
  handoverPropose(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input=this.parse(z.object({requestId:z.string().uuid(),receiverId:z.string().uuid(),expectedVersion:z.string().regex(/^[a-f0-9]{64}$/),observations:z.string().trim().max(2000).default(''),mode:z.enum(['CON_CIERRE','EN_REVISION']).default('CON_CIERRE')}).strict(),body);
    return this.handovers.propose(id,input,request.user);
  }

  @Post(':id/handover-difference')
  handoverDifference(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input=this.parse(z.object({expectedVersion:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),body);
    return this.handovers.registerDifference(id,input.expectedVersion,request.user);
  }

  @Post(':id/cancel-close-request')
  cancelClose(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.shifts.cancelClose(id,request.user);
  }

  @Post('handovers/:id/:action')
  handoverResolve(@Param('id') id: string, @Param('action') action: string, @Req() request: AuthenticatedRequest) {
    if (!['accept','reject','cancel'].includes(action)) throw new BadRequestException('Accion de traspaso invalida.');
    return this.handovers.resolve(id,action as 'accept'|'reject'|'cancel',request.user);
  }

  @Post('export')
  exportRows(@Body() body: unknown, @Req() request: AuthenticatedRequest & { ip?: string }) {
    return this.shifts.exportRows(body, request);
  }

  @Post('dashboard/export')
  exportDashboard(@Body() body: unknown, @Req() request: AuthenticatedRequest & { ip?: string }) {
    const { from, to, day } = parseDashboardQuery(body);
    return this.shifts.exportDashboard(request, from, to, day);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.shifts.list(request.user);
  }

  @Get('open')
  open(@Req() request: AuthenticatedRequest) {
    return this.shifts.open(request.user);
  }

  @Get('dashboard')
  dashboard(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('day') day: string | undefined, @Req() request: AuthenticatedRequest, @Query() query?: unknown) {
    const dates = parseDashboardQuery(query ?? {
      ...(from === undefined ? {} : {from}), ...(to === undefined ? {} : {to}), ...(day === undefined ? {} : {day}),
    });
    return this.shifts.dashboard(request.user, dates.from, dates.to, dates.day);
  }

  @Get('current')
  current(@Req() request: AuthenticatedRequest) {
    return this.shifts.current(request.user);
  }

  @Get('access')
  access(@Req() request: AuthenticatedRequest) {
    return this.shifts.access(request.user);
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
  requestClose(@Param('id') id: string, @Req() request: AuthenticatedRequest, @Body() body?: unknown) {
    const input=this.parse(z.object({observations:z.string().trim().max(2000).default('')}).strict(),body??{});
    return this.shifts.requestClose(id, request.user,input.observations);
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.shifts.close(id, this.parse(closeShiftSchema, body), request.user);
  }

  @Post(':id/reject-close')
  rejectClose(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.shifts.rejectClose(id, request.user);
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
