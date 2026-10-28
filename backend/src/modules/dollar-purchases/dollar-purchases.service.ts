import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { calculatePurchaseLedger, PurchaseLedgerRow } from './purchase-ledger';
import { QueryResult, QueryResultRow } from 'pg';

type PurchaseDatabase = { query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> };

@Injectable()
export class DollarPurchasesService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    if (!['JEFA', 'CAJERO'].includes(user.roleCode)) {
      throw new ForbiddenException('No tiene permiso para consultar las compras de dolares.');
    }
    return this.load(user.roleCode, user.id, null);
  }

  // Solo se invoca despues de autorizar el turno en ShiftsService.
  async forAuthorizedShift(shiftId: string, database: PurchaseDatabase = this.db) {
    const rows = await this.load('JEFA', null, shiftId, database);
    return rows.reduce<{ usd: number; differenceNio: number }>((total, row) => ({
      usd: total.usd + Number(row.monto_comprado_usd),
      differenceNio: total.differenceNio + Number(row.diferencia_nio),
    }), { usd: 0, differenceNio: 0 });
  }

  private async load(role: string, userId: string | null, shiftId: string | null, database: PurchaseDatabase = this.db) {
    const scope = [role, userId, shiftId];
    const transactions = await database.query<PurchaseLedgerRow>(`
      select t.id_transaccion as database_id,t.id_grupo_transacciones as group_id,
        concat('TRA-',lpad(g.codigo_operacion::text,6,'0'),'-',lpad(t.orden_grupo::text,2,'0')) as id,
        t.fecha_transaccion,m.codigo as currency,tm.direccion as direction,tm.monto as amount,
        t.tasa_compra_usada,t.tasa_venta_usada,u.nombre_completo as cajero,s.nombre as sucursal,
        coalesce(c.primary_nio,0) as primary_nio,coalesce(c.primary_usd,0) as primary_usd,
        coalesce(c.change_nio,0) as change_nio,coalesce(c.change_usd,0) as change_usd,
        coalesce(c.shared,false) as shared,coalesce(c.sale_eligible,false) as sale_eligible,
        coalesce(c.primary_direction,'ENTRA') as primary_direction,
        coalesce(comp.nio,0) as compensation_nio,coalesce(comp.usd,0) as compensation_usd
      from temo.transacciones t join temo.grupos_transacciones g using(id_grupo_transacciones)
      join temo.transacciones_montos tm using(id_transaccion) join temo.monedas m using(id_moneda)
      join temo.usuarios u on u.id_usuario=t.id_cajero join temo.sucursales s on s.id_sucursal=t.id_sucursal
      left join lateral (
        select sum(a.monto_total) filter(where am.codigo='NIO' and a.tipo in ('TRANSACCION_RECIBIDO','TRANSACCION_ENTREGADO')) as primary_nio,
          sum(a.monto_total) filter(where am.codigo='USD' and a.tipo in ('TRANSACCION_RECIBIDO','TRANSACCION_ENTREGADO')) as primary_usd,
          sum(a.monto_total) filter(where am.codigo='NIO' and a.tipo='TRANSACCION_VUELTO') as change_nio,
          sum(a.monto_total) filter(where am.codigo='USD' and a.tipo='TRANSACCION_VUELTO') as change_usd,
          bool_or(a.id_transaccion is null) as shared,
          bool_or(a.tipo='TRANSACCION_RECIBIDO' and a.tipo_tasa='VENTA'
            and a.tasa_usada=t.tasa_venta_usada and a.tasa_usada>t.tasa_compra_usada) as sale_eligible,
          max(case a.tipo when 'TRANSACCION_ENTREGADO' then 'SALE' when 'TRANSACCION_RECIBIDO' then 'ENTRA' end) as primary_direction
        from temo.arqueos a join temo.monedas am using(id_moneda)
        where (a.id_transaccion=t.id_transaccion or (a.id_transaccion is null and a.id_grupo_transacciones=t.id_grupo_transacciones))
          and a.id_abono_pendiente is null
          and a.tipo in ('TRANSACCION_RECIBIDO','TRANSACCION_ENTREGADO','TRANSACCION_VUELTO')
      ) c on true
      left join lateral (
        select sum(ap.monto) filter(where cm.codigo='NIO') as nio,sum(ap.monto) filter(where cm.codigo='USD') as usd
        from temo.abonos_pendientes ap join temo.transacciones source on source.id_transaccion=ap.id_transaccion
        join temo.monedas cm on cm.id_moneda=ap.id_moneda
        where source.id_grupo_transacciones=t.id_grupo_transacciones and source.estado<>'ANULADA'
          and ap.observaciones='Compensación con saldo a favor de una transacción en curso'
      ) comp on true
      where t.estado<>'ANULADA' and tm.medio='EFECTIVO'
        and not exists(select 1 from temo.pagos_pendientes pp where pp.id_transaccion=t.id_transaccion)
        and ($3::uuid is null or t.id_turno=$3)
        and ($1='JEFA' or (t.id_cajero=$2 and exists(select 1 from temo.turnos active_shift
          where active_shift.id_turno=t.id_turno and active_shift.id_cajero=$2
            and active_shift.estado in ('ABIERTO','PENDIENTE_APROBACION'))))
      order by t.id_grupo_transacciones,t.orden_grupo,t.id_transaccion`, scope);
    const pending = await database.query<ReturnType<typeof calculatePurchaseLedger>[number]>(`
      with cash_payments as (
        select ap.*,t.id_grupo_transacciones,t.orden_grupo,t.id_sucursal,s.id_cajero,
          coalesce(ap.id_lote_liquidacion,ap.id_abono) as lot
        from temo.abonos_pendientes ap join temo.pagos_pendientes pp using(id_pendiente)
        join temo.transacciones t on t.id_transaccion=pp.id_transaccion
        join temo.turnos s on s.id_turno=ap.id_turno_aplicacion join temo.monedas m on m.id_moneda=ap.id_moneda
        where pp.tipo='POR_COBRAR' and m.codigo='USD' and ap.id_transaccion=pp.id_transaccion
          and ($3::uuid is null or ap.id_turno_aplicacion=$3)
          and ($1='JEFA' or (s.id_cajero=$2 and s.estado in ('ABIERTO','PENDIENTE_APROBACION')))
          and exists(select 1 from temo.abonos_pendientes owner join temo.arqueos a on a.id_abono_pendiente=owner.id_abono
            where coalesce(owner.id_lote_liquidacion,owner.id_abono)=coalesce(ap.id_lote_liquidacion,ap.id_abono)
              and a.tipo='PENDIENTE_RECIBIDO' and a.tipo_tasa='VENTA'
              and a.tasa_usada=ap.tasa_venta_usada and a.tasa_usada>ap.tasa_compra_usada)
      ), purchases as (
        select cp.*,greatest(least(cp.monto,coalesce((
          select sum(case me.direccion when 'ENTRA' then me.monto else -me.monto end)
          from temo.movimientos_efectivo me join temo.abonos_pendientes owner on owner.id_abono=me.id_abono_pendiente
          join temo.monedas m on m.id_moneda=me.id_moneda
          where coalesce(owner.id_lote_liquidacion,owner.id_abono)=cp.lot and m.codigo='NIO' and me.es_reverso=false
        ),0)/nullif(cp.tasa_venta_usada,0)-coalesce(sum(cp.monto) over(partition by cp.lot
          order by cp.fecha_abono,cp.id_abono rows between unbounded preceding and 1 preceding),0)),0) as purchased_usd
        from cash_payments cp
      ) select p.id_abono as database_id,
        concat('TRA-',lpad(g.codigo_operacion::text,6,'0'),'-',lpad(p.orden_grupo::text,2,'0')) as id,
        p.fecha_abono as fecha_transaccion,round(p.purchased_usd,4) as monto_comprado_usd,
        round(p.purchased_usd*greatest(coalesce(p.tasa_venta_usada,0)-coalesce(p.tasa_compra_usada,0),0),4) as diferencia_nio,
        p.tasa_compra_usada,p.tasa_venta_usada,u.nombre_completo as cajero,s.nombre as sucursal
      from purchases p join temo.grupos_transacciones g using(id_grupo_transacciones)
      join temo.usuarios u on u.id_usuario=p.id_cajero join temo.sucursales s on s.id_sucursal=p.id_sucursal
      where p.purchased_usd>0`, scope);
    return [...calculatePurchaseLedger(transactions.rows), ...pending.rows].sort((a, b) =>
      new Date(b.fecha_transaccion).getTime() - new Date(a.fecha_transaccion).getTime() || b.id.localeCompare(a.id));
  }
}
