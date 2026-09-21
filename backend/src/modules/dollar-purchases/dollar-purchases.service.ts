import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DollarPurchasesService {
  constructor(private readonly db: DatabaseService) {}

  // Reconstruye compras de dolares desde transacciones y arqueos sin crear saldos paralelos.
  async list(user: AuthenticatedUser) {
    if (user.roleCode !== 'JEFA') {
      throw new ForbiddenException('Solo el Administrador puede consultar las compras de dolares.');
    }

    const result = await this.db.query(`
      with valid_transactions as (
        select
          t.id_transaccion,
          t.id_grupo_transacciones,
          t.orden_grupo,
          t.fecha_transaccion,
          t.tasa_compra_usada,
          t.tasa_venta_usada,
          t.id_cajero,
          t.id_sucursal,
          tm.direccion,
          tm.monto,
          m.codigo as moneda
        from temo.transacciones t
        join temo.transacciones_montos tm on tm.id_transaccion = t.id_transaccion
        join temo.monedas m on m.id_moneda = tm.id_moneda
        left join temo.pagos_pendientes pp on pp.id_transaccion = t.id_transaccion
        where t.estado <> 'ANULADA'
          and pp.id_pendiente is null
      ),
      group_coverage as (
        select
          groups.id_grupo_transacciones,
          coalesce((
            select sum(vt.monto)
            from valid_transactions vt
            where vt.id_grupo_transacciones = groups.id_grupo_transacciones
              and vt.moneda = 'USD'
              and vt.direccion = 'SALE'
          ), 0) + coalesce((
            select sum(me.monto)
            from temo.movimientos_efectivo me
            join temo.monedas cash_currency on cash_currency.id_moneda = me.id_moneda
            join temo.transacciones cash_transaction on cash_transaction.id_transaccion = me.id_transaccion
            left join temo.pagos_pendientes cash_pending on cash_pending.id_transaccion = cash_transaction.id_transaccion
            where cash_transaction.id_grupo_transacciones = groups.id_grupo_transacciones
              and cash_transaction.estado <> 'ANULADA'
              and cash_pending.id_pendiente is null
              and cash_currency.codigo = 'USD'
              and me.direccion = 'ENTRA'
              and me.es_reverso = false
          ), 0) as usd_coverage
        from temo.grupos_transacciones groups
      ),
      usd_income as (
        select
          vt.*,
          gc.usd_coverage,
          coalesce(sum(vt.monto) over (
            partition by vt.id_grupo_transacciones
            order by vt.orden_grupo, vt.id_transaccion
            rows between unbounded preceding and 1 preceding
          ), 0) as previous_usd_income
        from valid_transactions vt
        join group_coverage gc on gc.id_grupo_transacciones = vt.id_grupo_transacciones
        where vt.moneda = 'USD' and vt.direccion = 'ENTRA'
      ),
      calculated as (
        select
          ui.*,
          greatest(
            ui.monto - greatest(ui.usd_coverage - ui.previous_usd_income, 0),
            0
          ) as purchased_usd
        from usd_income ui
      )
      select
        c.id_transaccion as database_id,
        concat('TRA-', lpad(g.codigo_operacion::text, 6, '0'), '-', lpad(c.orden_grupo::text, 2, '0')) as id,
        c.fecha_transaccion,
        round(c.purchased_usd, 4) as monto_comprado_usd,
        round(c.purchased_usd * greatest(coalesce(c.tasa_venta_usada, 0) - coalesce(c.tasa_compra_usada, 0), 0), 4) as diferencia_nio,
        c.tasa_compra_usada,
        c.tasa_venta_usada,
        u.nombre_completo as cajero,
        s.nombre as sucursal
      from calculated c
      join temo.grupos_transacciones g on g.id_grupo_transacciones = c.id_grupo_transacciones
      join temo.usuarios u on u.id_usuario = c.id_cajero
      join temo.sucursales s on s.id_sucursal = c.id_sucursal
      where c.purchased_usd > 0
      order by c.fecha_transaccion desc, c.orden_grupo desc
    `);
    return result.rows;
  }
}
