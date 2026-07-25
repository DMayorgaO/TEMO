import { Controller, Get, Query } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async list(@Query('limit') limit = '50') {
    const safeLimit = Math.min(Number(limit) || 50, 200);
    const result = await this.db.query(
      `select
         t.id_transaccion as id,
         t.fecha_transaccion,
         coalesce(tm.monto, t.monto_original) as monto,
         coalesce(mm.codigo, m.codigo) as moneda,
         coalesce(tm.direccion, 'ENTRA') as direccion,
         t.estado,
         e.codigo as entidad,
         cm.nombre_operativo as movimiento,
         u.nombre_completo as cajero,
         cp.nombre as pendiente
       from temo.transacciones t
       join temo.monedas m on m.id_moneda = t.id_moneda_original
       join temo.cuentas_movimientos cm on cm.id_cuenta_movimiento = t.id_cuenta_movimiento
       join temo.cuentas_bancarias cb on cb.id_cuenta = cm.id_cuenta
       join temo.entidades_bancarias e on e.id_entidad = cb.id_entidad
       join temo.usuarios u on u.id_usuario = t.id_cajero
       left join lateral (
         select tm_inner.direccion, tm_inner.monto, tm_inner.id_moneda
         from temo.transacciones_montos tm_inner
         where tm_inner.id_transaccion = t.id_transaccion
           and tm_inner.medio = 'EFECTIVO'
         order by tm_inner.fecha_creacion desc
         limit 1
       ) tm on true
       left join temo.monedas mm on mm.id_moneda = tm.id_moneda
       left join temo.pagos_pendientes pp on pp.id_transaccion = t.id_transaccion
       left join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
       order by t.fecha_transaccion desc
       limit $1`,
      [safeLimit],
    );

    return result.rows;
  }
}
