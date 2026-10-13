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
          case when exists(select 1 from temo.arqueos a where a.id_transaccion=t.id_transaccion
            and a.tipo in ('TRANSACCION_RECIBIDO','TRANSACCION_ENTREGADO'))
            then t.id_transaccion else t.id_grupo_transacciones end as settlement_id,
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
        select settlement_id,
          coalesce(sum(monto) filter(where moneda='USD' and direccion='SALE'),0) as withdrawal,
          coalesce(sum(case direccion when 'ENTRA' then monto else -monto end)
            filter(where moneda='NIO'),0) as nominal_nio
        from valid_transactions group by settlement_id
      ), cash_usd as (
        /* El ingreso NIO neto descuenta vuelto; USD fisicos pueden cubrir otras pestanas. */
        select coalesce(me.id_transaccion,me.id_grupo_transacciones) as settlement_id,
          coalesce(sum(case me.direccion when 'ENTRA' then me.monto else -me.monto end)
            filter(where m.codigo='NIO'),0) as nio_income
        from temo.movimientos_efectivo me
        join temo.monedas m using(id_moneda)
        left join temo.transacciones t using(id_transaccion)
        left join temo.pagos_pendientes pp using(id_transaccion)
        where me.es_reverso=false and me.id_abono_pendiente is null
          and (me.id_transaccion is null or t.estado<>'ANULADA') and pp.id_pendiente is null
        group by coalesce(me.id_transaccion,me.id_grupo_transacciones)
      ), group_coverage as (
        select tu.settlement_id, greatest(coalesce(cu.nio_income,0)-tu.nominal_nio,0) as nio_income,
          tu.withdrawal as usd_coverage
        from transaction_usd tu left join cash_usd cu using(settlement_id)
      ),
      usd_income as (
        select
          vt.*,
          gc.usd_coverage,
          gc.nio_income,
          coalesce(sum(vt.monto) over (
            partition by vt.settlement_id
            order by vt.orden_grupo, vt.id_transaccion
            rows between unbounded preceding and 1 preceding
          ), 0) as previous_usd_income
        from valid_transactions vt
        join group_coverage gc using(settlement_id)
        where vt.moneda = 'USD' and vt.direccion = 'ENTRA'
      ),
      calculated as (
        select
          ui.*,
          greatest(least(
            ui.monto - greatest(ui.usd_coverage - ui.previous_usd_income, 0),
            ui.nio_income / nullif(ui.tasa_venta_usada,0)
              - greatest(ui.previous_usd_income-ui.usd_coverage,0)
          ),0) as purchased_usd
        from usd_income ui
      )
      , cash_payments as (
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
              and a.tipo_tasa = 'VENTA' and a.tasa_usada = ap.tasa_venta_usada
              and a.tasa_usada > ap.tasa_compra_usada
          )
      ), pending_purchases as (
        select cp.*,
          greatest(least(cp.monto, coalesce((
            select sum(case me.direccion when 'ENTRA' then me.monto else -me.monto end)
            from temo.movimientos_efectivo me
            join temo.abonos_pendientes owner on owner.id_abono = me.id_abono_pendiente
            join temo.monedas m on m.id_moneda = me.id_moneda
            where coalesce(owner.id_lote_liquidacion, owner.id_abono) = cp.lot
              and m.codigo = 'NIO' and me.es_reverso = false
          ), 0) / nullif(cp.tasa_venta_usada,0) - coalesce(sum(cp.monto) over (
            partition by cp.lot order by cp.fecha_abono, cp.id_abono
            rows between unbounded preceding and 1 preceding
          ), 0)), 0) as purchased_usd
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
      from calculated c
      join temo.grupos_transacciones g on g.id_grupo_transacciones = c.id_grupo_transacciones
      join temo.usuarios u on u.id_usuario = c.id_cajero
      join temo.sucursales s on s.id_sucursal = c.id_sucursal
      where c.purchased_usd > 0
        and c.nio_income > 0
        and exists(select 1 from temo.arqueos a
          where (a.id_transaccion=c.id_transaccion or
            (a.id_transaccion is null and a.id_grupo_transacciones=c.settlement_id))
            and a.tipo='TRANSACCION_RECIBIDO' and a.tipo_tasa='VENTA'
            and a.tasa_usada=c.tasa_venta_usada and a.tasa_usada>c.tasa_compra_usada)
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
