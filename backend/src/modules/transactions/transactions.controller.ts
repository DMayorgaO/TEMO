import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '../auth/auth.service';
import {
  createTransactionBatchSchema,
  payPendingBatchSchema,
  payPendingSchema,
  updateTransactionSchema,
} from './transaction-batch.schema';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly transactions: TransactionsService,
  ) {}

  @Post('batch')
  createBatch(
    @Body() body: unknown,
    @Req()
    request: {
      ip?: string;
      headers: { 'user-agent'?: string };
      user: AuthenticatedUser;
    },
  ) {
    const parsed = createTransactionBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Los datos del grupo de transacciones no son validos.',
        errors: parsed.error.flatten(),
      });
    }
    return this.transactions.createBatch({ ...parsed.data, userId: request.user.id }, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Get()
  async list(
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
    @Req() request: { user: AuthenticatedUser },
  ) {
    const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0);
    const result = await this.db.query(
      `select
         t.id_transaccion as database_id,
         concat(
           'TRA-',
           lpad(g.codigo_operacion::text, 6, '0'),
           '-',
           lpad(t.orden_grupo::text, 2, '0')
         ) as id,
         g.id_grupo_transacciones,
         g.codigo_operacion,
         t.orden_grupo,
         t.fecha_transaccion,
         coalesce(tm.monto, t.monto_original) as monto,
         coalesce(mm.codigo, m.codigo) as moneda,
         coalesce(tm.direccion, 'ENTRA') as direccion,
         t.estado,
         e.codigo as entidad,
         cm.codigo_operativo as codigo_movimiento,
         cm.nombre_operativo as movimiento,
         u.nombre_completo as cajero,
         s.nombre as sucursal,
         cp.nombre as pendiente,
         pp.id_pendiente as pending_database_id,
         pp.tipo as pending_type,
         pp.estado as pending_status,
         pp.saldo_pendiente as pending_balance,
         coalesce(t.descripcion, '') as descripcion,
         coalesce(liq.liquidacion, '{}'::jsonb) as liquidacion
       from temo.transacciones t
       join temo.grupos_transacciones g
         on g.id_grupo_transacciones = t.id_grupo_transacciones
       join temo.monedas m on m.id_moneda = t.id_moneda_original
       join temo.cuentas_movimientos cm on cm.id_cuenta_movimiento = t.id_cuenta_movimiento
       join temo.cuentas_bancarias cb on cb.id_cuenta = cm.id_cuenta
       join temo.entidades_bancarias e on e.id_entidad = cb.id_entidad
       join temo.usuarios u on u.id_usuario = t.id_cajero
       join temo.turnos tu on tu.id_turno = t.id_turno
       join temo.sucursales s on s.id_sucursal = t.id_sucursal
       left join lateral (
         select tm_inner.direccion, tm_inner.monto, tm_inner.id_moneda
         from temo.transacciones_montos tm_inner
         where tm_inner.id_transaccion = t.id_transaccion
           and tm_inner.medio = 'EFECTIVO'
         order by tm_inner.fecha_creacion desc
         limit 1
       ) tm on true
       left join temo.monedas mm on mm.id_moneda = tm.id_moneda
       left join temo.pagos_pendientes pp
         on pp.id_transaccion = t.id_transaccion
        and pp.estado in ('PENDIENTE', 'ABONADO', 'VENCIDO')
       left join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
       left join lateral (
         select jsonb_object_agg(
           v.codigo_moneda,
           jsonb_build_object(
             'monto_recibido', v.monto_recibido,
             'monto_entregado', v.monto_entregado,
             'monto_vuelto', v.monto_vuelto,
             'monto_esperado_recibido', v.monto_esperado_recibido,
             'monto_esperado_entregado', v.monto_esperado_entregado,
             'monto_esperado_vuelto', v.monto_esperado_vuelto,
             'diferencia', v.diferencia,
             'monto_neto', v.monto_neto
           )
         ) as liquidacion
         from temo.vw_grupos_transacciones_liquidacion v
         where v.id_grupo_transacciones = t.id_grupo_transacciones
       ) liq on true
       where (
         $3 = 'JEFA'
         or (
           t.id_cajero = $4::uuid
           and tu.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
         )
       )
       order by t.fecha_transaccion desc, t.id_transaccion desc
       limit $1 offset $2`,
      [safeLimit, safeOffset, request.user.roleCode, request.user.id],
    );

    return result.rows;
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user: AuthenticatedUser },
  ) {
    const parsed = updateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Los datos de la transaccion no son validos.',
        errors: parsed.error.flatten(),
      });
    }
    return this.transactions.update(id, parsed.data, request.user);
  }

  @Get(':id/detail')
  detail(
    @Param('id') id: string,
    @Req() request: { user: AuthenticatedUser },
  ) {
    return this.transactions.detail(id, request.user);
  }

  @Get('pending')
  pending(@Req() request: { user: AuthenticatedUser }) {
    return this.transactions.listPending(request.user);
  }

  @Post('pending/:id/pay')
  payPending(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: { user: AuthenticatedUser },
  ) {
    const parsed = payPendingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'El arqueo del pago pendiente no es valido.',
        errors: parsed.error.flatten(),
      });
    }
    return this.transactions.payPending(id, parsed.data, request.user);
  }

  @Post('pending/pay-batch')
  payPendingBatch(
    @Body() body: unknown,
    @Req() request: { user: AuthenticatedUser },
  ) {
    const parsed = payPendingBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Los datos de la liquidacion multiple no son validos.',
        errors: parsed.error.flatten(),
      });
    }
    return this.transactions.payPendingBatch(parsed.data, request.user);
  }
}
