import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DollarPurchasesService {
  constructor(private readonly db: DatabaseService) {}

  // Reconstruye compras de dolares desde transacciones y arqueos sin crear saldos paralelos.
  async list(user: AuthenticatedUser) {
    if (!['JEFA', 'CAJERO'].includes(user.roleCode)) {
      throw new ForbiddenException('No tiene permiso para consultar las compras de dolares.');
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
          and tm.medio = 'EFECTIVO'
          and pp.id_pendiente is null
          and (
            $1 = 'JEFA'
            or (
              t.id_cajero = $2
              and exists (
                select 1
                from temo.turnos active_shift
                where active_shift.id_turno = t.id_turno
                  and active_shift.id_cajero = $2
                  and active_shift.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
              )
            )
          )
      ),
      transaction_usd as (
        select id_grupo_transacciones,
          coalesce(sum(monto) filter(where direccion='ENTRA'),0) as income,
          coalesce(sum(monto) filter(where direccion='SALE'),0) as withdrawal
        from valid_transactions where moneda='USD' group by id_grupo_transacciones
      ), cash_usd as (
        /* Incluye arqueos compartidos y por transaccion; el neto descuenta vuelto en USD. */
        select coalesce(t.id_grupo_transacciones,me.id_grupo_transacciones) as id_grupo_transacciones,
          sum(case me.direccion when 'ENTRA' then me.monto else -me.monto end) as net_income
        from temo.movimientos_efectivo me
        join temo.monedas m using(id_moneda)
        left join temo.transacciones t using(id_transaccion)
        left join temo.pagos_pendientes pp using(id_transaccion)
        where m.codigo='USD' and me.es_reverso=false and me.id_abono_pendiente is null
          and (me.id_transaccion is null or t.estado<>'ANULADA') and pp.id_pendiente is null
        group by coalesce(t.id_grupo_transacciones,me.id_grupo_transacciones)
      ), group_coverage as (
        select tu.id_grupo_transacciones,
          tu.withdrawal+greatest(coalesce(cu.net_income,0),0) as usd_coverage
        from transaction_usd tu left join cash_usd cu using(id_grupo_transacciones)
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
      , withdrawal_coverage as (
        /* Retiro USD pagado en NIO: descuenta depositos USD y dolares fisicos entregados. */
        select tu.id_grupo_transacciones,
          tu.income+greatest(-coalesce(cu.net_income,0),0) as usd_coverage
        from transaction_usd tu left join cash_usd cu using(id_grupo_transacciones)
      ), usd_withdrawals as (
        select vt.*, wc.usd_coverage,
          coalesce(sum(vt.monto) over (partition by vt.id_grupo_transacciones
            order by vt.orden_grupo,vt.id_transaccion
            rows between unbounded preceding and 1 preceding),0) as previous_usd_withdrawal
        from valid_transactions vt join withdrawal_coverage wc using(id_grupo_transacciones)
        where vt.moneda='USD' and vt.direccion='SALE'
      ), withdrawal_purchases as (
        select uw.*, greatest(uw.monto-greatest(uw.usd_coverage-uw.previous_usd_withdrawal,0),0) as purchased_usd
        from usd_withdrawals uw
      ), all_transaction_purchases as (
        select id_transaccion,id_grupo_transacciones,orden_grupo,fecha_transaccion,
          tasa_compra_usada,tasa_venta_usada,id_cajero,id_sucursal,purchased_usd from calculated
        union all
        select id_transaccion,id_grupo_transacciones,orden_grupo,fecha_transaccion,
          tasa_compra_usada,tasa_venta_usada,id_cajero,id_sucursal,purchased_usd from withdrawal_purchases
      ), cash_payments as (
        select ap.*, pp.tipo, t.id_grupo_transacciones, t.orden_grupo,
          t.id_sucursal, s.id_cajero,
          coalesce(ap.id_lote_liquidacion, ap.id_abono) as lot
        from temo.abonos_pendientes ap
        join temo.pagos_pendientes pp using (id_pendiente)
        join temo.transacciones t on t.id_transaccion = pp.id_transaccion
        join temo.turnos s on s.id_turno = ap.id_turno_aplicacion
        join temo.monedas m on m.id_moneda = ap.id_moneda
        where pp.tipo = 'POR_COBRAR' and m.codigo = 'USD'
          and ap.id_transaccion = pp.id_transaccion
          and ($1 = 'JEFA' or (s.id_cajero = $2 and s.estado in ('ABIERTO', 'PENDIENTE_APROBACION')))
          and exists (
            select 1 from temo.abonos_pendientes owner
            join temo.arqueos a on a.id_abono_pendiente = owner.id_abono
            where coalesce(owner.id_lote_liquidacion, owner.id_abono) = coalesce(ap.id_lote_liquidacion, ap.id_abono)
              and a.tipo = 'PENDIENTE_RECIBIDO'
          )
      ), pending_purchases as (
        select cp.*,
          greatest(cp.monto - greatest(coalesce((
            select sum(case me.direccion when 'ENTRA' then me.monto else -me.monto end)
            from temo.movimientos_efectivo me
            join temo.abonos_pendientes owner on owner.id_abono = me.id_abono_pendiente
            join temo.monedas m on m.id_moneda = me.id_moneda
            where coalesce(owner.id_lote_liquidacion, owner.id_abono) = cp.lot
              and m.codigo = 'USD' and me.es_reverso = false
          ), 0) - coalesce(sum(cp.monto) over (
            partition by cp.lot order by cp.fecha_abono, cp.id_abono
            rows between unbounded preceding and 1 preceding
          ), 0), 0), 0) as purchased_usd
        from cash_payments cp
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
      from all_transaction_purchases c
      join temo.grupos_transacciones g on g.id_grupo_transacciones = c.id_grupo_transacciones
      join temo.usuarios u on u.id_usuario = c.id_cajero
      join temo.sucursales s on s.id_sucursal = c.id_sucursal
      where c.purchased_usd > 0
      union all
      select p.id_abono as database_id,
        concat('TRA-', lpad(g.codigo_operacion::text, 6, '0'), '-', lpad(p.orden_grupo::text, 2, '0')) as id,
        p.fecha_abono as fecha_transaccion,
        round(p.purchased_usd, 4) as monto_comprado_usd,
        round(p.purchased_usd * greatest(coalesce(p.tasa_venta_usada, 0) - coalesce(p.tasa_compra_usada, 0), 0), 4) as diferencia_nio,
        p.tasa_compra_usada, p.tasa_venta_usada, u.nombre_completo as cajero, s.nombre as sucursal
      from pending_purchases p
      join temo.grupos_transacciones g using (id_grupo_transacciones)
      join temo.usuarios u on u.id_usuario = p.id_cajero
      join temo.sucursales s on s.id_sucursal = p.id_sucursal
      where p.purchased_usd > 0
      order by fecha_transaccion desc, id desc
    `, [user.roleCode, user.id]);
    return result.rows;
  }
}
