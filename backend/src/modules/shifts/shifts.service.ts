import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { DollarPurchasesService } from '../dollar-purchases/dollar-purchases.service';
import { assertShiftNotSubmitted } from '../../common/shift-submission-lock';
import { validateFinancialActor } from '../../common/financial-request';
import { authorizedExport, parseExportSelection, requireExportRole, recordAuthorizedExport } from '../../common/export-selection';
import { preferentialCashAdjustment, preferentialGroupMarker, PreferentialCashRow } from '../../common/preferential-cash';
import {
  CashCountsInput,
  CloseShiftInput,
  OpenShiftInput,
  SaveCashCountInput,
  UpdateClosedShiftInput,
  UpdateShiftInput,
} from './shifts.schema';

type CurrencyCode = 'NIO' | 'USD';
type CashCountType = 'APERTURA' | 'ACTUAL' | 'CIERRE_CONTADO';

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
};

type ShiftRow = QueryResultRow & {
  database_id: string;
  id: string;
  estado: string;
  fecha_apertura: Date;
  fecha_cierre: Date | null;
  efectivo_inicial_nio: string;
  efectivo_inicial_usd: string;
  efectivo_final_nio: string | null;
  efectivo_final_usd: string | null;
  cambio_nio: string;
  observaciones_apertura: string;
  observaciones_cierre: string;
  id_sucursal: string;
  sucursal: string;
  id_caja: string;
  caja: string;
  id_cajero: string;
  cajero: string;
  cajero_usuario: string;
  solicitud_estado: string | null;
};

@Injectable()
export class ShiftsService {
  constructor(private readonly db: DatabaseService,
    private readonly purchases: DollarPurchasesService = new DollarPurchasesService(db)) {}

  async exportRows(body: unknown, request: { user: AuthenticatedUser; ip?: string }) {
    requireExportRole(request.user);
    const input = parseExportSelection(body);
    return authorizedExport(this.db, request, 'Turnos', input, await this.list(request.user, input.ids), row => row.database_id);
  }

  async exportDashboard(request: { user: AuthenticatedUser; ip?: string }, from?: string, to?: string, day?: string) {
    requireExportRole(request.user, true);
    const data = await this.dashboard(request.user, from, to, day);
    await recordAuthorizedExport(this.db, request, 'Grafica de transacciones', 'PNG', data.counts.length);
    return data;
  }

  async dashboard(user: AuthenticatedUser, from?: string, to?: string, day?: string) {
    this.requireBoss(user);
    return this.db.transaction(async client => {
      await client.query('set transaction isolation level repeatable read read only');
      const clock = (await client.query(`select to_char(now() at time zone 'America/Managua','YYYY-MM-DD') as today,
        to_char(date_trunc('week',now() at time zone 'America/Managua'),'YYYY-MM-DD') as monday,
        to_char(date_trunc('week',now() at time zone 'America/Managua')+interval '5 days','YYYY-MM-DD') as saturday`)).rows[0];
      const start = from || clock.monday, end = to || clock.saturday;
      const tableDay = day || clock.today;
      const counts = await client.query(`select to_char(t.fecha_transaccion at time zone 'America/Managua','YYYY-MM-DD') as day,
        s.id_sucursal as branch_id,s.nombre as branch,u.id_usuario as cashier_id,u.nombre_completo as cashier,
        e.codigo as entity,
        count(*) filter(where m.codigo='NIO')::int as nio,count(*) filter(where m.codigo='USD')::int as usd,count(*)::int as total
        from temo.transacciones t join temo.sucursales s using(id_sucursal)
        join temo.usuarios u on u.id_usuario=t.id_cajero join temo.monedas m on m.id_moneda=t.id_moneda_original
        join temo.cuentas_movimientos cm using(id_cuenta_movimiento)
        join temo.cuentas_bancarias cb using(id_cuenta) join temo.entidades_bancarias e using(id_entidad)
        where t.estado<>'ANULADA' and not exists(select 1 from temo.correcciones_transacciones_cerradas h where h.id_transaccion=t.id_transaccion and h.anulada)
        and ((t.fecha_transaccion>=($1::date::timestamp at time zone 'America/Managua') and t.fecha_transaccion<(($2::date+1)::timestamp at time zone 'America/Managua'))
          or (t.fecha_transaccion>=($3::date::timestamp at time zone 'America/Managua') and t.fecha_transaccion<(($3::date+1)::timestamp at time zone 'America/Managua')))
        group by 1,s.id_sucursal,s.nombre,u.id_usuario,u.nombre_completo,e.codigo order by day,branch,cashier,e.codigo`,[start,end,tableDay]);
      const accounts = await client.query(`select cb.id_cuenta as account_id,cb.alias as account,
        e.codigo as entity,m.codigo as currency,s.id_sucursal as branch_id,s.nombre as branch
        from temo.cuentas_bancarias cb join temo.entidades_bancarias e using(id_entidad)
        join temo.monedas m using(id_moneda) cross join temo.sucursales s
        where cb.estado='ACTIVO' and e.estado='ACTIVO' and m.estado='ACTIVO' and s.estado='ACTIVO'
        and (not exists(select 1 from temo.cuentas_sucursales scope where scope.id_cuenta=cb.id_cuenta)
          or exists(select 1 from temo.cuentas_sucursales scope where scope.id_cuenta=cb.id_cuenta and scope.id_sucursal=s.id_sucursal))
        order by s.nombre,e.codigo,m.codigo,cb.alias`);
      const available = new Set(accounts.rows.map(row=>`${row.branch_id}:${row.account_id}`));
      const shifts = await client.query(`select t.id_turno from temo.turnos t
        where t.estado in ('ABIERTO','PENDIENTE_APROBACION') or (t.estado='CERRADO'
        and (t.fecha_cierre at time zone 'America/Managua')::date=$1::date)`,[clock.today]);
      const balances = shifts.rows.length ? await this.loadBalances(shifts.rows.map(row=>row.id_turno),client) : [];
      // An account is shared: choose its latest active reading, never sum successive shifts.
      const shared = new Map<string, typeof balances[number]>();
      for (const row of balances) {
        if (!available.has(`${row.branch_id}:${row.account_id}`)) continue;
        if (row.shift_state==='CERRADO') row.system=row.closing_system ?? row.system;
        const key = `${row.branch_id}:${row.account_id}`;
        const previous = shared.get(key);
        const priority = row.shift_state==='CERRADO'?0:1;
        const previousPriority = previous?.shift_state==='CERRADO'?0:1;
        if (!previous || priority>previousPriority || (priority===previousPriority && new Date(row.updated_at).getTime()>new Date(previous.updated_at).getTime())) shared.set(key,row);
      }
      const reconciliation = await client.query(`with active_accounts as (
        select cb.id_cuenta,e.codigo as entity,m.codigo as currency,s.id_sucursal as branch_id,s.nombre as branch
        from temo.cuentas_bancarias cb join temo.entidades_bancarias e using(id_entidad)
        join temo.monedas m using(id_moneda) cross join temo.sucursales s
        where cb.estado='ACTIVO' and e.estado='ACTIVO' and m.estado='ACTIVO' and s.estado='ACTIVO'
          and (e.codigo='PEX' or (e.codigo='TELEDOLAR' and m.codigo='USD'))
          and (not exists(select 1 from temo.cuentas_sucursales scope where scope.id_cuenta=cb.id_cuenta)
            or exists(select 1 from temo.cuentas_sucursales scope where scope.id_cuenta=cb.id_cuenta and scope.id_sucursal=s.id_sucursal))
      ), movements as (
        select cm.id_cuenta,t.id_sucursal,
          sum(t.monto_original) filter(where ef.direccion_efectivo='ENTRA') as income,
          sum(t.monto_original) filter(where ef.direccion_efectivo='SALE') as expense
        from temo.transacciones t join temo.cuentas_movimientos cm using(id_cuenta_movimiento)
        join temo.efectos_movimientos ef using(id_cuenta_movimiento)
        where t.estado<>'ANULADA'
          and t.fecha_transaccion>=($1::date::timestamp at time zone 'America/Managua')
          and t.fecha_transaccion<(($1::date+1)::timestamp at time zone 'America/Managua')
        group by cm.id_cuenta,t.id_sucursal
      ) select a.branch_id,a.branch,a.entity,a.currency,
          coalesce(sum(m.income),0) as income,coalesce(sum(m.expense),0) as expense
        from active_accounts a left join movements m on m.id_cuenta=a.id_cuenta and m.id_sucursal=a.branch_id
        group by a.branch_id,a.branch,a.entity,a.currency order by a.branch,a.entity,a.currency`,[clock.today]);
      return {today:clock.today,tableDay,from:start,to:end,counts:counts.rows,accounts:accounts.rows,
        banks:[...new Set([...accounts.rows,...counts.rows].map(row=>row.entity))].sort(),balances:[...shared.values()],
        lafise:balances.filter(row=>row.entity==='LAFISE' && row.shift_day===clock.today),reconciliation:reconciliation.rows};
    });
  }

  async list(user: AuthenticatedUser, selectedIds?: string[]) {
    const result = await this.db.query<ShiftRow>(
      `${this.shiftSelect()}
       where ($1 = 'JEFA' or t.id_cajero = $2)
         and ($3::uuid[] is null or t.id_turno = any($3::uuid[]))
       order by t.fecha_apertura desc, t.fecha_creacion desc`,
      [user.roleCode, user.id, selectedIds ?? null],
    );
    return result.rows;
  }

  async open(user: AuthenticatedUser) {
    const result = await this.db.query<ShiftRow>(
      `${this.shiftSelect()}
       where t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
         and ($1 = 'JEFA' or t.id_cajero = $2)
       order by t.fecha_apertura desc`,
      [user.roleCode, user.id],
    );
    return result.rows;
  }

  async access(user: AuthenticatedUser) {
    if (user.roleCode !== 'CAJERO') throw new ForbiddenException('Esta consulta corresponde al cajero autenticado.');
    const result = await this.db.query<{ database_id: string; estado: string; sucursal: string; caja: string }>(
      `select t.id_turno as database_id, t.estado, s.nombre as sucursal, c.nombre as caja
       from temo.turnos t join temo.sucursales s using(id_sucursal) join temo.cajas c using(id_caja)
       where t.id_cajero=$1 and t.estado in ('ABIERTO','PENDIENTE_APROBACION','PENDIENTE_APERTURA','EN_REVISION')
       order by t.fecha_apertura desc, t.fecha_creacion desc`, [user.id]);
    return {
      active: result.rows.find(row => row.estado === 'ABIERTO' || row.estado === 'PENDIENTE_APROBACION') ?? result.rows.find(row=>row.estado==='EN_REVISION') ?? null,
      prepared: result.rows.find(row => row.estado === 'PENDIENTE_APERTURA') ?? null,
    };
  }

  async current(user: AuthenticatedUser) {
    const shift = await this.findCurrentShift(user);
    if (!shift) {
      return null;
    }
    await this.ensureCurrentCashCount(shift.database_id, user.id);
    return this.loadShiftDetail(shift);
  }

  async detail(shiftId: string, user: AuthenticatedUser) {
    const shift = await this.findAuthorizedShift(shiftId, user);
    return this.loadShiftDetail(shift);
  }

  private async loadShiftDetail(shift: ShiftRow) {
    const shiftId = shift.database_id;
    const cashCounts = await this.loadCashCounts(shiftId);
    const balances = await this.loadBalances(shiftId);
    const availableAccounts = await this.loadAvailableAccounts(shift.id_sucursal);
    const availableMovements = await this.loadAvailableMovements(shift.id_sucursal);
    const cashSummary = await this.loadCashSummary(shiftId);
    const dollarPurchases = await this.purchases.forAuthorizedShift(shiftId);
    return {
      ...shift,
      cashCounts,
      balances,
      availableAccounts,
      availableMovements,
      ...cashSummary,
      dollarPurchases,
    };
  }

  async create(input: OpenShiftInput, user: AuthenticatedUser) {
    this.requireBoss(user);
    const shiftId = await this.db.transaction(async (client) => {
      const branchId = await this.resolveActiveBranch(client, input.branchId, input.branch);

      const cashierResult = await client.query<{ id_usuario: string } & QueryResultRow>(
        `select id_usuario
         from temo.usuarios
         where (lower(nombre_completo) = lower($1) or lower(usuario) = lower($1))
           and estado = 'ACTIVO'
         limit 1`,
        [input.cashier],
      );
      const cashierId = cashierResult.rows[0]?.id_usuario;
      if (!cashierId) {
        throw new NotFoundException('El cajero seleccionado no existe o no esta activo.');
      }

      const existing = await client.query(
        `select 1 from temo.turnos
         where id_cajero = $1 and estado in ('PENDIENTE_APERTURA', 'ABIERTO', 'PENDIENTE_APROBACION')`,
        [cashierId],
      );
      if (existing.rowCount) {
        throw new ConflictException('El cajero ya tiene un turno abierto.');
      }

      const registerId = await this.resolveAvailableRegister(
        client,
        branchId,
        input.register,
      );

      const workdayResult = await client.query<{ id_jornada: string } & QueryResultRow>(
        `insert into temo.jornadas (fecha, id_sucursal, id_usuario_apertura, estado)
         values (current_date, $1, $2, 'ABIERTO')
         on conflict (fecha, id_sucursal) do update
           set id_usuario_apertura = temo.jornadas.id_usuario_apertura
         returning id_jornada`,
        [branchId, user.id],
      );

      const totals = this.cashTotals(input.counts);
      const inserted = await client.query<{ id_turno: string } & QueryResultRow>(
        `insert into temo.turnos (
           id_jornada, id_sucursal, id_caja, id_cajero, id_usuario_apertura,
           efectivo_inicial_nio, efectivo_inicial_usd, observaciones_apertura, estado
         ) values ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''), $9::temo.estado_turno)
         returning id_turno`,
        [
          workdayResult.rows[0].id_jornada,
          branchId,
          registerId,
          cashierId,
          user.id,
          totals.NIO,
          totals.USD,
          input.notes,
          input.prepared ? 'PENDIENTE_APERTURA' : 'ABIERTO',
        ],
      );
      const id = inserted.rows[0].id_turno;
      await this.persistCashCounts(client, id, registerId, user.id, 'APERTURA', input.counts);
      await this.persistCashCounts(client, id, registerId, user.id, 'ACTUAL', input.counts);
      await this.persistOpeningBalances(client, id, branchId, input.balances);
      return id;
    });
    return this.detail(shiftId, user);
  }

  async openPrepared(shiftId: string, user: AuthenticatedUser) {
    const openedId = await this.db.transaction(async (client) => {
      const prepared = await client.query<{
        id_turno: string;
        id_sucursal: string;
        id_cajero: string;
      } & QueryResultRow>(
        `select id_turno, id_sucursal, id_cajero
         from temo.turnos
         where id_turno = $1 and estado = 'PENDIENTE_APERTURA'
         for update`,
        [shiftId],
      );
      const shift = prepared.rows[0];
      if (!shift) throw new ConflictException('El turno ya no esta pendiente de apertura.');
      if (shift.id_cajero !== user.id) {
        throw new ForbiddenException('Solo el cajero asignado puede abrir este turno.');
      }
      const active = await client.query(
        `select 1 from temo.turnos
         where id_cajero = $1 and id_turno <> $2
           and estado in ('ABIERTO', 'PENDIENTE_APROBACION')`,
        [user.id, shiftId],
      );
      if (active.rowCount) throw new ConflictException('Ya tiene otro turno abierto.');
      const workday = await client.query<{ id_jornada: string } & QueryResultRow>(
        `insert into temo.jornadas (fecha, id_sucursal, id_usuario_apertura, estado)
         values (current_date, $1, $2, 'ABIERTO')
         on conflict (fecha, id_sucursal) do update
           set id_usuario_apertura = temo.jornadas.id_usuario_apertura
         returning id_jornada`,
        [shift.id_sucursal, user.id],
      );
      // La apertura real redefine la fecha para ordenar y auditar el inicio del cajero.
      await client.query(
        `update temo.turnos
         set estado = 'ABIERTO', id_jornada = $2, id_usuario_apertura = $3,
             fecha_apertura = now(), fecha_modificacion = now()
         where id_turno = $1`,
        [shiftId, workday.rows[0].id_jornada, user.id],
      );
      await client.query(
        `insert into temo.bitacora (id_usuario, accion, tabla, id_registro, datos_nuevos)
         values ($1, 'APROBAR', 'turnos', $2,
           jsonb_build_object('evento', 'ABRIR_TURNO_PREPARADO'))`,
        [user.id, shiftId],
      );
      return shiftId;
    });
    return this.detail(openedId, user);
  }

  async update(shiftId: string, input: UpdateShiftInput, user: AuthenticatedUser) {
    this.requireBoss(user);
    const currentShift = await this.findAuthorizedShift(shiftId, user);
    // El Administrador puede corregir un turno alistado, pero no modificar turnos cerrados o anulados.
    if (!['PENDIENTE_APERTURA', 'ABIERTO', 'PENDIENTE_APROBACION'].includes(currentShift.estado)) {
      throw new ConflictException('El turno ya no admite cambios de apertura.');
    }
    await this.db.transaction(async (client) => {
      const branchId = await this.resolveActiveBranch(client, input.branchId, input.branch);

      const cashierResult = await client.query<{ id_usuario: string } & QueryResultRow>(
        `select id_usuario from temo.usuarios
         where (lower(nombre_completo) = lower($1) or lower(usuario) = lower($1))
           and estado = 'ACTIVO' limit 1`,
        [input.cashier],
      );
      const cashierId = cashierResult.rows[0]?.id_usuario;
      if (!cashierId) {
        throw new NotFoundException('El cajero seleccionado no existe o no esta activo.');
      }
      const cashierConflict = await client.query(
        `select 1 from temo.turnos
         where id_cajero = $1 and id_turno <> $2
           and estado in ('PENDIENTE_APERTURA', 'ABIERTO', 'PENDIENTE_APROBACION')`,
        [cashierId, shiftId],
      );
      if (cashierConflict.rowCount) {
        throw new ConflictException('El cajero seleccionado ya tiene otro turno abierto.');
      }

      const registerId = await this.resolveAvailableRegister(
        client,
        branchId,
        input.register,
        shiftId,
      );

      const workdayResult = await client.query<{ id_jornada: string } & QueryResultRow>(
        `insert into temo.jornadas (fecha, id_sucursal, id_usuario_apertura, estado)
         values (current_date, $1, $2, 'ABIERTO')
         on conflict (fecha, id_sucursal) do update
           set id_usuario_apertura = temo.jornadas.id_usuario_apertura
         returning id_jornada`,
        [branchId, user.id],
      );
      const totals = this.cashTotals(input.counts);
      await client.query(
        `update temo.turnos set
           id_jornada = $2, id_sucursal = $3, id_caja = $4, id_cajero = $5,
           efectivo_inicial_nio = $6, efectivo_inicial_usd = $7,
           observaciones_apertura = nullif($8, ''), fecha_modificacion = now()
         where id_turno = $1`,
        [shiftId, workdayResult.rows[0].id_jornada, branchId, registerId, cashierId, totals.NIO, totals.USD, input.notes],
      );
      await this.persistCashCounts(client, shiftId, registerId, user.id, 'APERTURA', input.counts);

      const transactionCount = await client.query<{ count: string } & QueryResultRow>(
        `select count(*)::text as count from temo.transacciones where id_turno = $1`,
        [shiftId],
      );
      if (Number(transactionCount.rows[0].count) === 0) {
        await this.persistCashCounts(client, shiftId, registerId, user.id, 'ACTUAL', input.counts);
        await client.query(`delete from temo.saldos_turno_cuentas where id_turno = $1`, [shiftId]);
      }
      await this.persistOpeningBalances(client, shiftId, branchId, input.balances);

      if (currentShift.id_cajero !== cashierId) {
        await client.query(`delete from temo.solicitudes_cierre_turno where id_turno = $1`, [shiftId]);
        if (currentShift.estado !== 'PENDIENTE_APERTURA') {
          await client.query(`update temo.turnos set estado = 'ABIERTO' where id_turno = $1`, [shiftId]);
        }
      }
    });
    return this.detail(shiftId, user);
  }

  async saveCashCount(shiftId: string, input: SaveCashCountInput, user: AuthenticatedUser) {
    const shift = await this.findAuthorizedShift(shiftId, user, true);
    await this.db.transaction(async (client) => {
      const writable=await this.lockWritableShift(client,shiftId,user);
      const before=writable.estado==='EN_REVISION'?await this.shiftAudit(client,shiftId):null;
      await this.persistCashCounts(client, shiftId, shift.id_caja, user.id, 'ACTUAL', input.counts);
      await client.query(
        `update temo.turnos
         set cambio_nio = $2, fecha_modificacion = now()
         where id_turno = $1`,
        [shiftId, input.changeNio],
      );
      if(before)await this.auditReviewCorrection(client,shiftId,user.id,'CORREGIR_ARQUEO_EN_REVISION',before);
    });
    return this.detail(shiftId, user);
  }

  async updateClosed(shiftId: string, input: UpdateClosedShiftInput, user: AuthenticatedUser) {
    this.requireBoss(user);
    if ((await this.db.query(`select 1 from temo.traspasos_turno where id_turno_origen=$1 and estado='ACEPTADO'`,[shiftId])).rowCount) {
      throw new ConflictException('Este cierre ya fue traspasado a otro cajero. No se pueden modificar las existencias entregadas.');
    }
    const shift = await this.findAuthorizedShift(shiftId, user);
    if (shift.estado !== 'CERRADO') {
      throw new ConflictException('Solo se pueden corregir datos de cierre en un turno cerrado.');
    }

    await this.db.transaction(async (client) => {
      const openingTotals = this.cashTotals(input.opening.counts);
      const closingTotals = this.cashTotals(input.closing.counts);
      await this.persistCashCounts(client, shiftId, shift.id_caja, user.id, 'APERTURA', input.opening.counts);
      await this.persistCashCounts(client, shiftId, shift.id_caja, user.id, 'CIERRE_CONTADO', input.closing.counts);
      await this.persistOpeningBalances(client, shiftId, shift.id_sucursal, input.opening.balances);
      await this.persistClosingBalances(client, shiftId, input.closing.balances);
      await client.query(
        `update temo.turnos set
           efectivo_inicial_nio = $2,
           efectivo_inicial_usd = $3,
           efectivo_final_nio = $4,
           efectivo_final_usd = $5,
           cambio_nio = $6,
           observaciones_apertura = nullif($7, ''),
           observaciones_cierre = nullif($8, ''),
           fecha_modificacion = now()
         where id_turno = $1`,
        [
          shiftId,
          openingTotals.NIO,
          openingTotals.USD,
          closingTotals.NIO,
          closingTotals.USD,
          input.closing.changeNio,
          input.opening.notes,
          input.closing.notes,
        ],
      );
      await client.query(
        `insert into temo.bitacora (id_usuario, accion, tabla, id_registro, datos_nuevos)
         values ($1, 'CORREGIR', 'turnos', $2,
           jsonb_build_object('apertura_corregida', true, 'cierre_corregido', true))`,
        [user.id, shiftId],
      );
    });
    return this.detail(shiftId, user);
  }

  async saveBalances(
    shiftId: string,
    balances: Array<{ account: string; amount: number; income?: number; expense?: number }>,
    user: AuthenticatedUser,
  ) {
    await this.findAuthorizedShift(shiftId, user, true);
    await this.db.transaction(async (client) => {
      const writable=await this.lockWritableShift(client,shiftId,user);
      const before=writable.estado==='EN_REVISION'?await this.shiftAudit(client,shiftId):null;
      const currentBalances = await this.loadBalances(shiftId, client);
      for (const balance of balances) {
        const current = currentBalances.find((row) => row.account === balance.account);
        await client.query(
          `update temo.saldos_turno_cuentas stc
           set saldo_final_calculado = case when eb.codigo = 'TELEDOLAR' then $8 else stc.saldo_inicial
                 + (case when eb.codigo = 'PEX' then -1 else 1 end) * coalesce((
                   select sum(case movement.direccion when 'ENTRA' then movement.monto else -movement.monto end)
                   from (
                     select mc.direccion, mc.monto
                     from temo.movimientos_cuentas mc
                     join temo.transacciones tr on tr.id_transaccion = mc.id_transaccion
                     where mc.id_cuenta = stc.id_cuenta and tr.id_turno = $1 and tr.estado <> 'ANULADA'
                     union all
                     select mc.direccion, mc.monto
                     from temo.movimientos_cuentas mc
                     join temo.transferencias tf on tf.id_transferencia = mc.id_transferencia
                     where mc.id_cuenta = stc.id_cuenta and tf.id_turno = $1 and tf.estado = 'ACTIVO'
                   ) movement
                 ), 0) end,
               saldo_final_sistema = $3,
               saldo_ingresos_sistema = $4,
               saldo_egresos_sistema = $5,
               ingresos_referencia_sistema = $6,
               egresos_referencia_sistema = $7
           from temo.cuentas_bancarias cb
           join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
           where stc.id_turno = $1
             and stc.id_cuenta = cb.id_cuenta
             and cb.alias = $2`,
          [shiftId, balance.account, balance.amount, balance.income ?? null, balance.expense ?? null,
            current?.income ?? null, current?.expense ?? null, current?.calculated ?? null],
        );
      }
      if(before)await this.auditReviewCorrection(client,shiftId,user.id,'CORREGIR_SALDOS_EN_REVISION',before);
    });
    return this.detail(shiftId, user);
  }

  async requestClose(shiftId: string, user: AuthenticatedUser, observations = '') {
    const shift = await this.findAuthorizedShift(shiftId, user, true);
    if (shift.id_cajero !== user.id) {
      throw new ForbiddenException('Solo el cajero del turno puede solicitar su cierre.');
    }
    return this.db.transaction(async client => {
    await validateFinancialActor(client,user,['CAJERO']);
    const locked = await client.query('select estado,id_cajero from temo.turnos where id_turno=$1 for update', [shiftId]);
    if (locked.rows[0]?.id_cajero!==user.id) throw new ForbiddenException('Solo el cajero del turno puede solicitar su cierre.');
    if (!['ABIERTO', 'PENDIENTE_APROBACION','EN_REVISION'].includes(locked.rows[0]?.estado)) {
      throw new ConflictException('El turno ya no admite solicitudes de cierre.');
    }
    const reviewing=locked.rows[0].estado==='EN_REVISION';
    await assertShiftNotSubmitted(client,shiftId,user);
    const result = await client.query(
      `insert into temo.solicitudes_cierre_turno (
         id_turno, id_usuario_solicitud, estado, fecha_solicitud,
         id_usuario_revision, fecha_revision, fecha_notificacion_cajero_leida,
         observaciones_cierre,bloquea_cambios
       ) values ($1, $2, 'PENDIENTE', clock_timestamp(), null, null, null, nullif($3,''),true)
       on conflict (id_turno) do update set
         id_usuario_solicitud = excluded.id_usuario_solicitud,
         estado = 'PENDIENTE',
         bloquea_cambios = true,
         fecha_solicitud = clock_timestamp(),
         id_usuario_revision = null,
         fecha_revision = null,
         fecha_notificacion_cajero_leida = null,
         observaciones_cierre = coalesce(excluded.observaciones_cierre,temo.solicitudes_cierre_turno.observaciones_cierre)
       returning id_solicitud_cierre as id`,
      [shiftId, user.id,observations],
    );
    await client.query(
      `update temo.turnos
       set estado = $2::temo.estado_turno, fecha_modificacion = now()
       where id_turno = $1`,
      [shiftId,reviewing?'EN_REVISION':'PENDIENTE_APROBACION'],
    );
    await client.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos)
      values($1,'ACTUALIZAR','turnos',$2,jsonb_build_object('evento',$4::text,
        'estado',$5::text,'observaciones',$3::text))`,[user.id,shiftId,observations,
      reviewing?'SOLICITAR_CIERRE_TRAS_CORRECCIONES':'SOLICITAR_CIERRE_TURNO',reviewing?'EN_REVISION':'PENDIENTE_APROBACION']);
    return result.rows[0];
    });
  }

  async notifications(user: AuthenticatedUser) {
    if (user.roleCode === 'JEFA') {
      const result = await this.db.query(
        `select
           sc.id_solicitud_cierre as id,
           'CLOSE_REQUEST' as kind,
           t.estado as shift_state,
           t.id_turno as shift_id,
           concat('TUR-', lpad(t.codigo_turno::text, 6, '0')) as shift_code,
           u.nombre_completo as cashier,
           s.nombre as branch,
           c.nombre as register,
           sc.fecha_solicitud as created_at,
           sc.observaciones_cierre as observations,
           null::numeric as amount,
           null::text as currency,
           null::text as transfer_type,
           null::text as transfer_direction
         from temo.solicitudes_cierre_turno sc
         join temo.turnos t on t.id_turno = sc.id_turno
         join temo.usuarios u on u.id_usuario = t.id_cajero
         join temo.sucursales s on s.id_sucursal = t.id_sucursal
         join temo.cajas c on c.id_caja = t.id_caja
         where sc.estado = 'PENDIENTE'
         order by sc.fecha_solicitud`,
      );
      const transferNotifications = await this.db.query(
        `select
           n.id_notificacion as id,
           'TRANSFER_RECORDED' as kind,
           n.id_turno as shift_id,
           concat('TUR-', lpad(t.codigo_turno::text, 6, '0')) as shift_code,
           u.nombre_completo as cashier,
           s.nombre as branch,
           c.nombre as register,
           n.fecha_creacion as created_at,
           n.mensaje as observations,
           tr.monto as amount,
           m.codigo as currency,
           tr.tipo::text as transfer_type,
           tr.direccion::text as transfer_direction,
           eb.codigo as transfer_entity,
           cb.alias as transfer_account
         from temo.notificaciones_usuarios n
         join temo.transferencias tr on tr.id_transferencia = n.id_transferencia
         join temo.monedas m on m.id_moneda = tr.id_moneda
         left join temo.cuentas_bancarias cb on cb.id_cuenta = tr.id_cuenta
         left join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
         join temo.turnos t on t.id_turno = n.id_turno
         join temo.usuarios u on u.id_usuario = t.id_cajero
         join temo.sucursales s on s.id_sucursal = t.id_sucursal
         join temo.cajas c on c.id_caja = t.id_caja
         where n.id_usuario_destino = $1
           and n.tipo = 'TRANSFERENCIA_REGISTRADA'
           and n.fecha_lectura is null`,
        [user.id],
      );
      const handovers=await this.db.query(`select n.id_notificacion as id,'SHIFT_HANDOVER' as kind,
        t.id_turno as shift_id,concat('TUR-',lpad(t.codigo_turno::text,6,'0')) as shift_code,
        u.nombre_completo as cashier,s.nombre as branch,c.nombre as register,n.fecha_creacion as created_at,n.mensaje as observations,
        u.nombre_completo as handover_sender,v.nombre_completo as handover_receiver,
        concat('TUR-',lpad(dest.codigo_turno::text,6,'0')) as handover_destination,h.modo as handover_mode,t.estado as shift_state
        from temo.notificaciones_usuarios n join temo.turnos t on t.id_turno=n.id_turno
        join temo.usuarios u on u.id_usuario=t.id_cajero join temo.sucursales s on s.id_sucursal=t.id_sucursal
        join temo.cajas c on c.id_caja=t.id_caja
        left join temo.traspasos_turno h on h.id_turno_origen=t.id_turno and h.estado='ACEPTADO'
        left join temo.usuarios v on v.id_usuario=h.id_receptor
        left join temo.turnos dest on dest.id_turno=h.id_turno_destino
        where n.id_usuario_destino=$1 and n.tipo='TRASPASO_TURNO' and n.fecha_lectura is null`,[user.id]);
      return [...result.rows, ...transferNotifications.rows,...handovers.rows].sort(
        (first, second) => new Date(String(first.created_at)).getTime() - new Date(String(second.created_at)).getTime(),
      );
    }

    const result = await this.db.query(
      `select
         sc.id_solicitud_cierre as id,
         'SHIFT_CLOSED' as kind,
         t.id_turno as shift_id,
         concat('TUR-', lpad(t.codigo_turno::text, 6, '0')) as shift_code,
         u.nombre_completo as cashier,
         s.nombre as branch,
         c.nombre as register,
         sc.fecha_revision as created_at,
         coalesce(sc.observaciones_cierre, '') as observations,
         null::numeric as amount,
         null::text as currency,
         null::text as transfer_type,
         null::text as transfer_direction,
         null::text as transfer_entity,
         null::text as transfer_account
       from temo.solicitudes_cierre_turno sc
       join temo.turnos t on t.id_turno = sc.id_turno
       join temo.usuarios u on u.id_usuario = t.id_cajero
       join temo.sucursales s on s.id_sucursal = t.id_sucursal
       join temo.cajas c on c.id_caja = t.id_caja
       where sc.id_usuario_solicitud = $1
         and sc.estado = 'ATENDIDA'
         and sc.fecha_notificacion_cajero_leida is null
       union all
       select
         n.id_notificacion as id,
         case when n.tipo = 'TRANSFERENCIA_REGISTRADA' then 'TRANSFER_RECORDED' else 'PENDING_PAID' end as kind,
         n.id_turno as shift_id,
         concat('TUR-', lpad(t.codigo_turno::text, 6, '0')) as shift_code,
         coalesce(cp.nombre, u.nombre_completo) as cashier,
         s.nombre as branch,
         c.nombre as register,
         n.fecha_creacion as created_at,
         n.mensaje as observations,
         coalesce(tr.monto, payment.monto) as amount,
         coalesce(tm.codigo, payment.moneda) as currency,
         tr.tipo::text as transfer_type,
         tr.direccion::text as transfer_direction,
         eb.codigo as transfer_entity,
         cb.alias as transfer_account
       from temo.notificaciones_usuarios n
       left join temo.turnos t on t.id_turno = n.id_turno
       left join temo.usuarios u on u.id_usuario = t.id_cajero
       left join temo.sucursales s on s.id_sucursal = t.id_sucursal
       left join temo.cajas c on c.id_caja = t.id_caja
       left join temo.pagos_pendientes pp on pp.id_pendiente = n.id_pendiente
       left join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
       left join temo.transferencias tr on tr.id_transferencia = n.id_transferencia
       left join temo.monedas tm on tm.id_moneda = tr.id_moneda
       left join temo.cuentas_bancarias cb on cb.id_cuenta = tr.id_cuenta
       left join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
       left join lateral (
         select ap.monto, m.codigo as moneda
         from temo.abonos_pendientes ap
         join temo.monedas m on m.id_moneda = ap.id_moneda
         where ap.id_pendiente = n.id_pendiente
         order by ap.fecha_abono desc
         limit 1
       ) payment on true
       where n.id_usuario_destino = $1
         and n.fecha_lectura is null
       order by created_at`,
      [user.id],
    );
    return result.rows;
  }

  async acknowledgeNotification(notificationId: string, user: AuthenticatedUser) {
    const generic = await this.db.query(
      `update temo.notificaciones_usuarios
       set fecha_lectura = now()
       where id_notificacion = $1
         and id_usuario_destino = $2
         and fecha_lectura is null
       returning id_notificacion as id`,
      [notificationId, user.id],
    );
    if (generic.rowCount) {
      return generic.rows[0];
    }

    const result = await this.db.query(
      `update temo.solicitudes_cierre_turno
       set fecha_notificacion_cajero_leida = now()
       where id_solicitud_cierre = $1
         and id_usuario_solicitud = $2
       returning id_solicitud_cierre as id`,
      [notificationId, user.id],
    );
    if (!result.rowCount) {
      throw new NotFoundException('La notificacion no existe.');
    }
    return result.rows[0];
  }

  async close(shiftId: string, input: CloseShiftInput, user: AuthenticatedUser) {
    this.requireBoss(user);
    const shift = await this.findAuthorizedShift(shiftId, user, true);
    await this.db.transaction(async (client) => {
      await validateFinancialActor(client,user,['JEFA']);
      const locked = await client.query('select estado from temo.turnos where id_turno=$1 for update', [shiftId]);
      if (!['ABIERTO', 'PENDIENTE_APROBACION','EN_REVISION'].includes(locked.rows[0]?.estado)) {
        throw new ConflictException('El turno ya no admite cierre. Actualice la pantalla.');
      }
      const before=await this.shiftAudit(client,shiftId);
      if(input.expectedCloseRequest&&!(await client.query(`select 1 from temo.solicitudes_cierre_turno
        where id_turno=$1 and estado='PENDIENTE' and fecha_solicitud::text=$2`,[shiftId,input.expectedCloseRequest])).rowCount){
        throw new ConflictException('La solicitud de cierre fue cancelada o renovada. Actualice el turno antes de revisarlo.');
      }
      const totals = this.cashTotals(input.counts);
      await this.persistCashCounts(client, shiftId, shift.id_caja, user.id, 'CIERRE_CONTADO', input.counts);
      await this.persistClosingBalances(client, shiftId, input.balances);
      await client.query(
        `update temo.turnos
         set
           estado = 'CERRADO',
           id_usuario_cierre = $2,
           fecha_cierre = now(),
           efectivo_final_nio = $3,
           efectivo_final_usd = $4,
           cambio_nio = $5,
           observaciones_cierre = nullif($6, ''),
           fecha_modificacion = now()
         where id_turno = $1`,
        [shiftId, user.id, totals.NIO, totals.USD, input.changeNio, input.observations],
      );
      await client.query(
        `update temo.solicitudes_cierre_turno
         set
           estado = 'ATENDIDA',
           id_usuario_revision = $2,
           fecha_revision = now(),
           observaciones_cierre = nullif($3, '')
         where id_turno = $1`,
        [shiftId, user.id, input.observations],
      );
      await client.query(
        `insert into temo.bitacora (
           id_usuario, accion, tabla, id_registro, datos_anteriores,datos_nuevos
         ) values ($1,'APROBAR','turnos',$2,$3::jsonb,$4::jsonb)`,
        [user.id,shiftId,JSON.stringify(before),JSON.stringify({...await this.shiftAudit(client,shiftId,'CIERRE_CONTADO'),evento:'APROBAR_CIERRE_TURNO',observaciones:input.observations})],
      );
    });
    return this.detail(shiftId, user);
  }

  async rejectClose(shiftId: string, user: AuthenticatedUser) {
    this.requireBoss(user);
    await this.db.transaction(async client => {
      await client.query('select pg_advisory_xact_lock(741260810)');
      await validateFinancialActor(client,user,['JEFA']);
      const shift = await client.query('select estado from temo.turnos where id_turno=$1 for update', [shiftId]);
      if (!shift.rowCount) throw new NotFoundException('El turno seleccionado no existe.');
      if (!['PENDIENTE_APROBACION','EN_REVISION'].includes(shift.rows[0].estado)) {
        throw new ConflictException('Solo se puede rechazar un cierre pendiente de aprobacion.');
      }
      const request = await client.query(`update temo.solicitudes_cierre_turno
        set estado='CANCELADA', bloquea_cambios=false, id_usuario_revision=$2, fecha_revision=now()
        where id_turno=$1 and estado='PENDIENTE' returning id_solicitud_cierre`, [shiftId, user.id]);
      if (request.rowCount !== 1) throw new ConflictException('La solicitud de cierre ya no esta pendiente.');
      await client.query(`update temo.turnos set estado=case when estado='EN_REVISION' then estado else 'ABIERTO'::temo.estado_turno end, fecha_modificacion=now()
        where id_turno=$1`, [shiftId]);
      await client.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_anteriores,datos_nuevos)
        values($1,'RECHAZAR','turnos',$2,
          jsonb_build_object('estado',$4::text,'solicitud_estado','PENDIENTE'),
          jsonb_build_object('evento','RECHAZAR_CIERRE_TURNO','estado',$3::text,'solicitud_estado','CANCELADA'))`, [user.id, shiftId,shift.rows[0].estado==='EN_REVISION'?'EN_REVISION':'ABIERTO',shift.rows[0].estado]);
    });
    return { success: true, message: 'Cierre rechazado. El cajero puede corregir su turno.' };
  }

  async cancelClose(shiftId: string, user: AuthenticatedUser) {
    await this.db.transaction(async client=>{
      await validateFinancialActor(client,user,['CAJERO']);
      const shift=(await client.query('select estado,id_cajero from temo.turnos where id_turno=$1 for update',[shiftId])).rows[0];
      if(!shift || shift.id_cajero!==user.id)throw new ForbiddenException('Solo puede cancelar el cierre de su propio turno.');
      if(!['PENDIENTE_APROBACION','EN_REVISION'].includes(shift.estado))throw new ConflictException('El turno no tiene un cierre pendiente.');
      const result=await client.query(`update temo.solicitudes_cierre_turno set estado='CANCELADA',bloquea_cambios=false,
        fecha_revision=now(),id_usuario_revision=$2 where id_turno=$1 and estado='PENDIENTE' and bloquea_cambios returning id_turno`,[shiftId,user.id]);
      if(!result.rowCount)throw new ConflictException('La solicitud ya fue resuelta o no esta bloqueada.');
      await client.query(`update temo.turnos set estado=case when estado='EN_REVISION' then estado else 'ABIERTO'::temo.estado_turno end,
        fecha_modificacion=now() where id_turno=$1`,[shiftId]);
      await client.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_nuevos)
        values($1,'ACTUALIZAR','turnos',$2,jsonb_build_object('evento','CANCELAR_SOLICITUD_CIERRE','estado',$3::text))`,[user.id,shiftId,shift.estado==='EN_REVISION'?'EN_REVISION':'ABIERTO']);
    });
    return this.detail(shiftId,user);
  }

  private async resolveAvailableRegister(
    client: PoolClient,
    branchId: string,
    preferredName: string,
    excludedShiftId?: string,
  ) {
    // Serializa solamente la asignacion de cajas de esta sucursal para evitar
    // que dos aperturas simultaneas creen o tomen la misma caja.
    await client.query(
      `select id_sucursal from temo.sucursales where id_sucursal = $1 for update`,
      [branchId],
    );

    const available = await client.query<{ id_caja: string } & QueryResultRow>(
      `select c.id_caja
       from temo.cajas c
       where c.id_sucursal = $1
         and c.estado = 'ACTIVO'
         and not exists (
           select 1
           from temo.turnos t
           where t.id_caja = c.id_caja
             and ($3::uuid is null or t.id_turno <> $3::uuid)
             and t.estado in ('PENDIENTE_APERTURA', 'ABIERTO', 'PENDIENTE_APROBACION')
         )
       order by
         case when lower(c.nombre) = lower($2) then 0 else 1 end,
         case
           when c.nombre ~* '^caja[[:space:]]+[0-9]+$'
             then substring(c.nombre from '[0-9]+')::integer
           else 2147483647
         end,
         c.nombre
       limit 1`,
      [branchId, preferredName, excludedShiftId ?? null],
    );
    if (available.rows[0]) {
      return available.rows[0].id_caja;
    }

    const next = await client.query<{ number: number } & QueryResultRow>(
      `select coalesce(max(
         case
           when nombre ~* '^caja[[:space:]]+[0-9]+$'
             then substring(nombre from '[0-9]+')::integer
           else 0
         end
       ), 0) + 1 as number
       from temo.cajas
       where id_sucursal = $1`,
      [branchId],
    );
    const registerNumber = Number(next.rows[0]?.number ?? 1);
    const inserted = await client.query<{ id_caja: string } & QueryResultRow>(
      `insert into temo.cajas (id_sucursal, codigo, nombre, estado)
       values ($1, $2, $3, 'ACTIVO')
       returning id_caja`,
      [branchId, `CAJA_${registerNumber}`, `Caja ${registerNumber}`],
    );
    return inserted.rows[0].id_caja;
  }

  private shiftSelect() {
    return `select
       t.id_turno as database_id,
       concat('TUR-', lpad(t.codigo_turno::text, 6, '0')) as id,
       t.estado,
       t.fecha_apertura,
       t.fecha_cierre,
       t.efectivo_inicial_nio,
       t.efectivo_inicial_usd,
       t.efectivo_final_nio,
       t.efectivo_final_usd,
       t.cambio_nio,
       coalesce(t.observaciones_apertura, '') as observaciones_apertura,
       coalesce(t.observaciones_cierre, '') as observaciones_cierre,
       s.id_sucursal,
       s.nombre as sucursal,
       c.id_caja,
       c.nombre as caja,
       u.id_usuario as id_cajero,
       u.nombre_completo as cajero,
       u.usuario as cajero_usuario,
       sc.estado as solicitud_estado,
       sc.observaciones_cierre as solicitud_observaciones,
       case when sc.estado='PENDIENTE' then sc.fecha_solicitud::text else null end as closure_version,
       (select jsonb_build_object('sender',a.nombre_completo,'receiver',b.nombre_completo,
         'source',concat('TUR-',lpad(t.codigo_turno::text,6,'0')),
         'destination',concat('TUR-',lpad(n.codigo_turno::text,6,'0')),'mode',h.modo,'state',t.estado,'observations',h.observaciones)
        from temo.traspasos_turno h join temo.usuarios a on a.id_usuario=h.id_emisor
        join temo.usuarios b on b.id_usuario=h.id_receptor left join temo.turnos n on n.id_turno=h.id_turno_destino
        where h.id_turno_origen=t.id_turno and h.estado='ACEPTADO' order by h.fecha_resolucion desc limit 1) as handover,
       (sc.estado='PENDIENTE' and sc.bloquea_cambios) is true as closure_requested,
       (t.estado='PENDIENTE_APROBACION' or (sc.estado='PENDIENTE' and sc.bloquea_cambios) is true
        or exists(select 1 from temo.traspasos_turno h where h.id_turno_origen=t.id_turno and h.estado='PENDIENTE'
          and h.fecha_limite>clock_timestamp())) as write_locked
     from temo.turnos t
     join temo.sucursales s on s.id_sucursal = t.id_sucursal
     join temo.cajas c on c.id_caja = t.id_caja
     join temo.usuarios u on u.id_usuario = t.id_cajero
     left join temo.solicitudes_cierre_turno sc on sc.id_turno = t.id_turno`;
  }

  private async findCurrentShift(user: AuthenticatedUser) {
    const result = await this.db.query<ShiftRow>(
      `${this.shiftSelect()}
       where t.id_cajero = $1
         and t.estado in ('ABIERTO', 'PENDIENTE_APROBACION','EN_REVISION')
       order by (t.estado='EN_REVISION'),t.fecha_apertura desc
       limit 1`,
      [user.id],
    );
    return result.rows[0] ?? null;
  }

  private async lockWritableShift(client: PoolClient, shiftId: string, user: AuthenticatedUser) {
    await validateFinancialActor(client,user,['JEFA','CAJERO']);
    await assertShiftNotSubmitted(client,shiftId,user);
    const result=await client.query(`select estado,id_cajero from temo.turnos where id_turno=$1 for update`,[shiftId]);
    const row=result.rows[0];
    if (!row || !['ABIERTO','PENDIENTE_APROBACION','EN_REVISION'].includes(row.estado)
      || (user.roleCode!=='JEFA' && row.id_cajero!==user.id)) throw new ConflictException('El turno ya no admite cambios. Actualice la pantalla.');
    return row;
  }

  private async shiftAudit(client: PoolClient, shiftId: string, type:'ACTUAL'|'CIERRE_CONTADO'='ACTUAL') {
    const state=(await client.query('select estado,cambio_nio from temo.turnos where id_turno=$1',[shiftId])).rows[0];
    const counts=(await this.loadCashCounts(shiftId,client))[type];
    const normalized=(currency:CurrencyCode)=>(counts?.[currency]?.lines??[])
      .map(line=>({denomination:line.denomination,piles25:0,loose:line.piles25*25+line.loose}))
      .filter(line=>line.loose>0).sort((a,b)=>b.denomination-a.denomination);
    const balances=(await this.loadBalances(shiftId,client)).map(row=>({id:row.account_id,account:row.account,currency:row.currency,
      calculated:String(row.calculated),system:String(row.system),income:row.system_income===null?null:String(row.system_income),expense:row.system_expense===null?null:String(row.system_expense)}));
    return {estado:state.estado,changeNio:Number(state.cambio_nio),settlement:{primaryCounts:{NIO:normalized('NIO'),USD:normalized('USD')}},balances};
  }

  private async auditReviewCorrection(client:PoolClient,shiftId:string,actorId:string,event:string,before:unknown) {
    const after=await this.shiftAudit(client,shiftId);
    if(JSON.stringify(before)===JSON.stringify(after))return;
    await client.query(`insert into temo.bitacora(id_usuario,accion,tabla,id_registro,datos_anteriores,datos_nuevos)
      values($1,'CORREGIR','turnos',$2,$3::jsonb,$4::jsonb)`,[actorId,shiftId,JSON.stringify(before),JSON.stringify({...after,evento:event})]);
  }

  private async findAuthorizedShift(
    shiftId: string,
    user: AuthenticatedUser,
    requireOpen = false,
  ) {
    const result = await this.db.query<ShiftRow>(
      `${this.shiftSelect()}
       where t.id_turno = $1
         and ($2 = 'JEFA' or t.id_cajero = $3)
         ${requireOpen ? "and t.estado in ('ABIERTO', 'PENDIENTE_APROBACION','EN_REVISION')" : ''}
       limit 1`,
      [shiftId, user.roleCode, user.id],
    );
    if (!result.rows[0]) {
      throw new NotFoundException('El turno no existe o no esta disponible para este usuario.');
    }
    return result.rows[0];
  }

  private requireBoss(user: AuthenticatedUser) {
    if (user.roleCode !== 'JEFA') {
      throw new ForbiddenException('Esta operacion requiere el perfil Administrador.');
    }
  }

  private async resolveActiveBranch(
    queryable: Queryable,
    branchId: string | undefined,
    branchReference: string,
  ) {
    const result = await queryable.query<{ id_sucursal: string } & QueryResultRow>(
      `select id_sucursal
       from temo.sucursales
       where estado = 'ACTIVO'
         and (
           ($1::uuid is not null and id_sucursal = $1::uuid)
           or (
             $1::uuid is null
             and (
               lower(trim(nombre)) = lower(trim($2))
               or lower(trim(codigo)) = lower(trim($2))
             )
           )
         )
       limit 1`,
      [branchId ?? null, branchReference],
    );
    const resolvedBranchId = result.rows[0]?.id_sucursal;
    if (!resolvedBranchId) {
      throw new NotFoundException('La sucursal seleccionada no existe o no esta activa.');
    }
    return resolvedBranchId;
  }

  private cashTotals(counts: CashCountsInput) {
    return {
      NIO: counts.NIO.reduce((sum, line) => sum + line.denomination * (line.piles25 * 25 + line.loose), 0),
      USD: counts.USD.reduce((sum, line) => sum + line.denomination * (line.piles25 * 25 + line.loose), 0),
    };
  }

  private async persistCashCounts(
    queryable: Queryable,
    shiftId: string,
    registerId: string,
    userId: string,
    type: CashCountType,
    counts: CashCountsInput,
  ) {
    for (const currency of ['NIO', 'USD'] as CurrencyCode[]) {
      await this.persistCashCount(queryable, shiftId, registerId, userId, type, currency, counts[currency]);
    }
  }

  private async persistCashCount(
    queryable: Queryable,
    shiftId: string,
    registerId: string,
    userId: string,
    type: CashCountType,
    currency: CurrencyCode,
    lines: CashCountsInput[CurrencyCode],
  ) {
    const currencyResult = await queryable.query<{ id_moneda: string } & QueryResultRow>(
      `select id_moneda from temo.monedas where codigo = $1`,
      [currency],
    );
    const currencyId = currencyResult.rows[0]?.id_moneda;
    if (!currencyId) {
      throw new NotFoundException(`No existe la moneda ${currency}.`);
    }
    const total = lines.reduce(
      (sum, line) => sum + line.denomination * (line.piles25 * 25 + line.loose),
      0,
    );
    const existing = await queryable.query<{ id_arqueo: string } & QueryResultRow>(
      `select id_arqueo
       from temo.arqueos
       where id_turno = $1 and id_moneda = $2 and tipo = $3::temo.tipo_arqueo
       order by fecha_creacion desc
       limit 1`,
      [shiftId, currencyId, type],
    );
    let cashCountId = existing.rows[0]?.id_arqueo;
    if (cashCountId) {
      await queryable.query(
        `update temo.arqueos
         set monto_total = $2, id_usuario_creacion = $3, fecha_creacion = now()
         where id_arqueo = $1`,
        [cashCountId, total, userId],
      );
      await queryable.query(
        `delete from temo.arqueos_denominaciones where id_arqueo = $1`,
        [cashCountId],
      );
    } else {
      const inserted = await queryable.query<{ id_arqueo: string } & QueryResultRow>(
        `insert into temo.arqueos (
           id_turno, id_caja, tipo, id_moneda, monto_total, id_usuario_creacion
         ) values ($1, $2, $3::temo.tipo_arqueo, $4, $5, $6)
         returning id_arqueo`,
        [shiftId, registerId, type, currencyId, total, userId],
      );
      cashCountId = inserted.rows[0].id_arqueo;
    }

    for (const line of lines) {
      const quantity = line.piles25 * 25 + line.loose;
      const denomination = await queryable.query<{ id_denominacion: string } & QueryResultRow>(
        `select id_denominacion
         from temo.denominaciones
         where id_moneda = $1 and valor = $2
         limit 1`,
        [currencyId, line.denomination],
      );
      if (!denomination.rows[0]) {
        throw new NotFoundException(`No existe la denominacion ${line.denomination} ${currency}.`);
      }
      await queryable.query(
        `insert into temo.arqueos_denominaciones (
           id_arqueo, id_denominacion, cantidad, monto, montones_25, sueltos
         ) values ($1, $2, $3, $4, $5, $6)`,
        [
          cashCountId,
          denomination.rows[0].id_denominacion,
          quantity,
          quantity * line.denomination,
          line.piles25,
          line.loose,
        ],
      );
    }
  }

  private async ensureCurrentCashCount(shiftId: string, userId: string) {
    const existing = await this.db.query(
      `select 1 from temo.arqueos where id_turno = $1 and tipo = 'ACTUAL' limit 1`,
      [shiftId],
    );
    if (existing.rowCount) {
      return;
    }
    const shift = await this.db.query<{ id_caja: string } & QueryResultRow>(
      `select id_caja from temo.turnos where id_turno = $1`,
      [shiftId],
    );
    const opening = await this.loadCashCounts(shiftId);
    await this.persistCashCounts(
      this.db,
      shiftId,
      shift.rows[0].id_caja,
      userId,
      'ACTUAL',
      {
        NIO: opening.APERTURA?.NIO?.lines ?? [],
        USD: opening.APERTURA?.USD?.lines ?? [],
      },
    );
  }

  private async loadCashCounts(shiftId: string, database: Queryable = this.db) {
    const result = await database.query<{
      tipo: CashCountType;
      moneda: CurrencyCode;
      monto_total: string;
      lines: Array<{ denomination: number; piles25: number; loose: number }>;
    } & QueryResultRow>(
      `select
         a.tipo,
         m.codigo as moneda,
         a.monto_total,
         coalesce(
           json_agg(
             json_build_object(
               'denomination', d.valor,
               'piles25', ad.montones_25,
               'loose', ad.sueltos
             ) order by d.orden
           ) filter (where ad.id_arqueo_denominacion is not null),
           '[]'::json
         ) as lines
       from temo.arqueos a
       join temo.monedas m on m.id_moneda = a.id_moneda
       left join temo.arqueos_denominaciones ad on ad.id_arqueo = a.id_arqueo
       left join temo.denominaciones d on d.id_denominacion = ad.id_denominacion
       where a.id_turno = $1
         and a.tipo in ('APERTURA', 'ACTUAL', 'CIERRE_CONTADO')
       group by a.id_arqueo, a.tipo, m.codigo, a.monto_total
       order by a.fecha_creacion`,
      [shiftId],
    );
    const output: Record<string, Partial<Record<CurrencyCode, { total: number; lines: typeof result.rows[number]['lines'] }>>> = {};
    for (const row of result.rows) {
      output[row.tipo] ??= {};
      output[row.tipo][row.moneda] = {
        total: Number(row.monto_total),
        lines: row.lines.map((line) => ({
          denomination: Number(line.denomination),
          piles25: Number(line.piles25),
          loose: Number(line.loose),
        })),
      };
    }
    return output;
  }

  private async loadBalances(shiftId: string | string[], database: Queryable = this.db) {
    const result = await database.query(
      `select
         selected_shift.id_turno as shift_id, selected_shift.estado as shift_state,
         selected_shift.id_sucursal as branch_id, branch.nombre as branch,
         selected_shift.id_cajero as cashier_id, cashier.nombre_completo as cashier,
         to_char(coalesce(selected_shift.fecha_cierre,selected_shift.fecha_apertura) at time zone 'America/Managua','YYYY-MM-DD') as shift_day,
         greatest(stc.fecha_actualizacion,stc.fecha_registro_cierre,selected_shift.fecha_cierre,selected_shift.fecha_apertura,
           (select max(mc.fecha_creacion) from temo.movimientos_cuentas mc
            left join temo.transacciones last_t on last_t.id_transaccion=mc.id_transaccion
            left join temo.transferencias last_tf on last_tf.id_transferencia=mc.id_transferencia
            where mc.id_cuenta=stc.id_cuenta and coalesce(last_t.id_turno,last_tf.id_turno)=stc.id_turno)) as updated_at,
         stc.id_cuenta as account_id,
         cb.alias as account,
         eb.codigo as entity,
         m.codigo as currency,
         case when eb.codigo = 'TELEDOLAR' then 0 else stc.saldo_inicial end as initial,
         coalesce(movements.income, 0) as income,
         coalesce(movements.expense, 0) as expense,
         computed.amount as calculated,
         stc.saldo_final_sistema as closing_system,
         case
           when eb.codigo = 'TELEDOLAR' then computed.amount
             + case when stc.ingresos_referencia_sistema is not null then coalesce(stc.saldo_ingresos_sistema,0) - stc.ingresos_referencia_sistema else 0 end
             - case when stc.egresos_referencia_sistema is not null then coalesce(stc.saldo_egresos_sistema,0) - stc.egresos_referencia_sistema else 0 end
           when stc.saldo_final_calculado is distinct from computed.amount then computed.amount
           else coalesce(stc.saldo_final_sistema, computed.amount)
         end as system,
         case when eb.codigo = 'TELEDOLAR' then coalesce(movements.income, 0)
           + case when stc.ingresos_referencia_sistema is not null then coalesce(stc.saldo_ingresos_sistema,0) - stc.ingresos_referencia_sistema else 0 end
           else stc.saldo_ingresos_sistema end as system_income,
         case when eb.codigo = 'TELEDOLAR' then coalesce(movements.expense, 0)
           + case when stc.egresos_referencia_sistema is not null then coalesce(stc.saldo_egresos_sistema,0) - stc.egresos_referencia_sistema else 0 end
           else stc.saldo_egresos_sistema end as system_expense,
         case
           when eb.codigo = 'TELEDOLAR' then
             case when stc.ingresos_referencia_sistema is not null then coalesce(stc.saldo_ingresos_sistema,0) - stc.ingresos_referencia_sistema else 0 end
             - case when stc.egresos_referencia_sistema is not null then coalesce(stc.saldo_egresos_sistema,0) - stc.egresos_referencia_sistema else 0 end
           when stc.saldo_final_calculado is distinct from computed.amount then 0
           else coalesce(stc.saldo_final_sistema, computed.amount) - computed.amount
         end as difference
       from temo.saldos_turno_cuentas stc
       join temo.turnos selected_shift on selected_shift.id_turno = stc.id_turno
       join temo.sucursales branch on branch.id_sucursal=selected_shift.id_sucursal
       join temo.usuarios cashier on cashier.id_usuario=selected_shift.id_cajero
       join temo.cuentas_bancarias cb on cb.id_cuenta = stc.id_cuenta
       join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
       join temo.monedas m on m.id_moneda = cb.id_moneda
       left join lateral (
         select
           coalesce(sum(mc.monto) filter (where mc.direccion = 'ENTRA'), 0) as income,
           coalesce(sum(mc.monto) filter (where mc.direccion = 'SALE'), 0) as expense
         from (
           select mc.direccion, mc.monto
           from temo.movimientos_cuentas mc
           join temo.transacciones tr on tr.id_transaccion = mc.id_transaccion
           join temo.turnos movement_shift on movement_shift.id_turno = tr.id_turno
           where mc.id_cuenta = stc.id_cuenta
             and tr.estado <> 'ANULADA'
             and (
               (eb.codigo = 'TELEDOLAR' and stc.traspaso_base_ingresos is null
                 and movement_shift.id_sucursal = selected_shift.id_sucursal
                 and (movement_shift.fecha_apertura at time zone 'America/Managua')::date = (selected_shift.fecha_apertura at time zone 'America/Managua')::date)
               or ((eb.codigo <> 'TELEDOLAR' or stc.traspaso_base_ingresos is not null) and tr.id_turno = stc.id_turno)
             )
           union all
           select mc.direccion, mc.monto
           from temo.movimientos_cuentas mc
           join temo.transferencias tf on tf.id_transferencia = mc.id_transferencia
           join temo.turnos movement_shift on movement_shift.id_turno = tf.id_turno
           where mc.id_cuenta = stc.id_cuenta
             and tf.estado = 'ACTIVO'
             and (
               (eb.codigo = 'TELEDOLAR' and stc.traspaso_base_ingresos is null
                 and movement_shift.id_sucursal = selected_shift.id_sucursal
                 and (movement_shift.fecha_apertura at time zone 'America/Managua')::date = (selected_shift.fecha_apertura at time zone 'America/Managua')::date)
               or ((eb.codigo <> 'TELEDOLAR' or stc.traspaso_base_ingresos is not null) and tf.id_turno = stc.id_turno)
             )
         ) mc
       ) raw_movements on true
       cross join lateral (select coalesce(raw_movements.income,0)+coalesce(stc.traspaso_base_ingresos,0) as income,
         coalesce(raw_movements.expense,0)+coalesce(stc.traspaso_base_egresos,0) as expense) movements
       cross join lateral (
         select
           (case when eb.codigo = 'TELEDOLAR' then 0 else stc.saldo_inicial end)
           + (case when eb.codigo = 'PEX' then -coalesce(movements.income, 0) else coalesce(movements.income, 0) end)
           + (case when eb.codigo = 'PEX' then coalesce(movements.expense, 0) else -coalesce(movements.expense, 0) end) as amount
       ) computed
       where stc.id_turno = any($1::uuid[])
         and (
           cb.estado = 'ACTIVO'
           or stc.saldo_inicial <> 0
           or stc.saldo_final_sistema is not null
           or coalesce(movements.income, 0) <> 0
           or coalesce(movements.expense, 0) <> 0
         )
       order by m.codigo, eb.codigo, cb.alias`,
      [Array.isArray(shiftId) ? shiftId : [shiftId]],
    );
    return result.rows;
  }

  private async loadAvailableAccounts(branchId: string) {
    const result = await this.db.query(
      `select
         cb.id_cuenta as account_id,
         cb.alias as account,
         eb.codigo as entity,
         m.codigo as currency
       from temo.cuentas_bancarias cb
       join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
       join temo.monedas m on m.id_moneda = cb.id_moneda
       where cb.estado = 'ACTIVO'
         and eb.estado = 'ACTIVO'
         and m.estado = 'ACTIVO'
         and (
           not exists (
             select 1 from temo.cuentas_sucursales all_scopes
             where all_scopes.id_cuenta = cb.id_cuenta
           )
           or exists (
             select 1 from temo.cuentas_sucursales branch_scope
             where branch_scope.id_cuenta = cb.id_cuenta
               and branch_scope.id_sucursal = $1
           )
         )
       order by eb.codigo, m.codigo, cb.consecutivo`,
      [branchId],
    );
    return result.rows;
  }

  private async loadAvailableMovements(branchId: string) {
    const result = await this.db.query(
      `select
         eb.codigo as entity,
         cm.codigo_operativo as code,
         cm.nombre_operativo as name,
         case ef.direccion_efectivo when 'SALE' then 'Salida' else 'Ingreso' end as direction,
         case ef.direccion_cuenta when 'SALE' then 'Salida' when 'ENTRA' then 'Ingreso' end as "accountDirection",
         coalesce(ef.afecta_cuenta, false) as "affectsAccount",
         array_agg(distinct m.codigo order by m.codigo) as currencies
       from temo.cuentas_movimientos cm
       join temo.cuentas_bancarias cb on cb.id_cuenta = cm.id_cuenta
       join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
       join temo.monedas m on m.id_moneda = cb.id_moneda
       join temo.movimientos mv on mv.id_movimiento = cm.id_movimiento
       join temo.efectos_movimientos ef on ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
       where cm.estado = 'ACTIVO'
         and cb.estado = 'ACTIVO'
         and eb.estado = 'ACTIVO'
         and m.estado = 'ACTIVO'
         and mv.estado = 'ACTIVO'
         and ef.direccion_efectivo is not null
         and (
           not exists (
             select 1 from temo.cuentas_sucursales all_scopes
             where all_scopes.id_cuenta = cb.id_cuenta
           )
           or exists (
             select 1 from temo.cuentas_sucursales branch_scope
             where branch_scope.id_cuenta = cb.id_cuenta
               and branch_scope.id_sucursal = $1
           )
         )
       group by eb.codigo, cm.codigo_operativo, cm.nombre_operativo,
         ef.direccion_efectivo, ef.direccion_cuenta, ef.afecta_cuenta
       order by eb.codigo, min(cm.prioridad), cm.nombre_operativo`,
      [branchId],
    );
    return result.rows;
  }

  private async loadCashSummary(shiftId: string, database: Queryable = this.db) {
    const [result, rateResult] = await Promise.all([database.query<{
      currency: CurrencyCode;
      expected_amount: string;
      pending_amount: string;
    } & QueryResultRow>(
      `select
         m.codigo as currency,
         (
           case when m.codigo = 'NIO' then t.efectivo_inicial_nio else t.efectivo_inicial_usd end
           + coalesce(transaction_cash.amount, 0)
           + coalesce(pending_compensation.amount, 0)
           + coalesce(paid_pending_cash.amount, 0)
           + coalesce(transfer_cash.amount, 0)
         ) as expected_amount,
         coalesce(open_pending.amount, 0) as pending_amount
       from temo.turnos t
       cross join temo.monedas m
       /* Los importes nominales en efectivo forman el fondo general; el credito queda excluido. */
       left join lateral (
         select sum(case tm.direccion when 'ENTRA' then tm.monto else -tm.monto end) as amount
         from temo.transacciones tr
         join temo.transacciones_montos tm on tm.id_transaccion = tr.id_transaccion
         where tr.id_turno = t.id_turno
           and tr.estado <> 'ANULADA'
           and tm.id_moneda = m.id_moneda
           and tm.medio = 'EFECTIVO'
       ) transaction_cash on true
       /* El saldo retenido de una transaccion paga la deuda sin entrar ni salir fisicamente de caja. */
       left join lateral (
         select sum(case pp.tipo when 'POR_COBRAR' then ap.monto else -ap.monto end) as amount
         from temo.abonos_pendientes ap
         join temo.pagos_pendientes pp on pp.id_pendiente = ap.id_pendiente
         where ap.id_turno_aplicacion = t.id_turno
           and ap.id_moneda = m.id_moneda
           and ap.observaciones = 'Compensación con saldo a favor de una transacción en curso'
       ) pending_compensation on true
       /* El esperado usa la deuda nominal, no el conteo: conserva diferencias de cambio y de efectivo. */
       left join lateral (
         select sum(case pp.tipo when 'POR_COBRAR' then ap.monto else -ap.monto end) as amount
         from temo.abonos_pendientes ap
         join temo.pagos_pendientes pp using (id_pendiente)
         where ap.id_turno_aplicacion = t.id_turno and ap.id_moneda = m.id_moneda
           and ap.id_transaccion = pp.id_transaccion
           and exists (
             select 1 from temo.abonos_pendientes owner
             join temo.arqueos a on a.id_abono_pendiente = owner.id_abono
             where coalesce(owner.id_lote_liquidacion, owner.id_abono) = coalesce(ap.id_lote_liquidacion, ap.id_abono)
               and a.tipo in ('PENDIENTE_RECIBIDO', 'PENDIENTE_ENTREGADO')
           )
       ) paid_pending_cash on true
       /* Solo las transferencias activas de efectivo modifican el fondo general. */
       left join lateral (
         select sum(case tf.direccion when 'ENTRA' then tf.monto else -tf.monto end) as amount
         from temo.transferencias tf
         where tf.id_turno = t.id_turno
           and tf.id_moneda = m.id_moneda
           and tf.tipo = 'EFECTIVO'
           and tf.estado = 'ACTIVO'
       ) transfer_cash on true
       /* Expone el saldo informativo que aun no debe formar parte del arqueo. */
       left join lateral (
         select sum(pp.saldo_pendiente) as amount
         from temo.pagos_pendientes pp
         join temo.transacciones pending_tr on pending_tr.id_transaccion = pp.id_transaccion
         where pending_tr.id_turno = t.id_turno
           and pending_tr.estado <> 'ANULADA'
           and pp.id_moneda = m.id_moneda
           and pp.estado in ('PENDIENTE', 'ABONADO', 'VENCIDO')
       ) open_pending on true
       where t.id_turno = $1 and m.codigo in ('NIO', 'USD')
      order by m.codigo`,
      [shiftId],
    ), database.query<{ buy_rate: string } & QueryResultRow>(
      `select coalesce((
         select tasa_compra from temo.tipos_cambio
         order by vigente_desde desc, fecha_creacion desc limit 1
       ), 36.40) as buy_rate`,
    )]);
    const summary = result.rows.reduce<{
      expectedCash: Record<CurrencyCode, number>;
      pendingCash: Record<CurrencyCode, number>;
    }>((summary, row) => {
      summary.expectedCash[row.currency] = Number(row.expected_amount);
      summary.pendingCash[row.currency] = Number(row.pending_amount);
      return summary;
    }, { expectedCash: { NIO: 0, USD: 0 }, pendingCash: { NIO: 0, USD: 0 } });
    const buyRate = Number(rateResult.rows[0]?.buy_rate || 36.4);
    const preferentialRows = await database.query<PreferentialCashRow & QueryResultRow>(
      `select tr.id_grupo_transacciones as group_id, m.codigo as currency,
         tm.direccion as direction, tm.monto as amount,
         tr.tasa_compra_usada as buy_rate, tr.tasa_venta_usada as sell_rate,
         coalesce(c.primary_nio, 0) as primary_nio, coalesce(c.primary_usd, 0) as primary_usd,
         coalesce(c.change_nio, 0) as change_nio, coalesce(c.change_usd, 0) as change_usd
       from temo.transacciones tr
       join temo.grupos_transacciones g using (id_grupo_transacciones)
       join temo.transacciones_montos tm using (id_transaccion)
       join temo.monedas m on m.id_moneda = tm.id_moneda
       left join lateral (
         select
           sum(a.monto_total) filter (where am.codigo = 'NIO' and a.tipo in ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO')) as primary_nio,
           sum(a.monto_total) filter (where am.codigo = 'USD' and a.tipo in ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO')) as primary_usd,
           sum(a.monto_total) filter (where am.codigo = 'NIO' and a.tipo = 'TRANSACCION_VUELTO') as change_nio,
           sum(a.monto_total) filter (where am.codigo = 'USD' and a.tipo = 'TRANSACCION_VUELTO') as change_usd
         from temo.arqueos a join temo.monedas am using (id_moneda)
         where a.id_transaccion = tr.id_transaccion and a.id_abono_pendiente is null
       ) c on true
       where tr.id_turno = $1 and tr.estado <> 'ANULADA' and tm.medio = 'EFECTIVO'
         and g.observaciones = $2 and tr.tasa_compra_usada = 36.55
       order by tr.id_grupo_transacciones, tr.orden_grupo`,
      [shiftId, preferentialGroupMarker],
    );
    const expectedGeneralNio = summary.expectedCash.NIO + summary.expectedCash.USD * buyRate
      + preferentialCashAdjustment(preferentialRows.rows, buyRate);

    // Expone una sola base contable en NIO; USD es únicamente su equivalente informativo.
    return {
      expectedCash: { NIO: expectedGeneralNio, USD: 0 },
      expectedGeneral: { NIO: expectedGeneralNio, USD: expectedGeneralNio / buyRate },
      expectedGeneralRate: buyRate,
      pendingCash: summary.pendingCash,
    };
  }

  async handoverSnapshot(client: PoolClient, shiftId: string) {
    const cash = (await this.loadCashCounts(shiftId,client)).ACTUAL;
    if (!cash?.NIO || !cash?.USD) throw new ConflictException('Guarde el arqueo de ambas monedas antes de traspasar.');
    const counts: CashCountsInput = { NIO: cash.NIO.lines, USD: cash.USD.lines };
    const totals=this.cashTotals(counts);
    const balances=await this.loadBalances(shiftId,client);
    const summary=await this.loadCashSummary(shiftId,client);
    const dollarPurchases=await this.purchases.forAuthorizedShift(shiftId,client);
    const state=await client.query(`select t.cambio_nio, to_char(now() at time zone 'America/Managua','YYYY-MM-DD') as day,
      to_char(t.fecha_apertura at time zone 'America/Managua','YYYY-MM-DD') as source_day,
      t.id_sucursal,t.id_caja,t.id_cajero,s.nombre as branch,c.nombre as register,u.nombre_completo as sender,
      concat('TUR-',lpad(t.codigo_turno::text,6,'0')) as shift_code
      from temo.turnos t join temo.sucursales s using(id_sucursal) join temo.cajas c using(id_caja)
      join temo.usuarios u on u.id_usuario=t.id_cajero where t.id_turno=$1`,[shiftId]);
    const row=state.rows[0];
    if (row.source_day!==row.day) throw new ConflictException('El turno corresponde a otra jornada. Solicite cierre administrativo para cambiar de dia.');
    const cashDifference=totals.NIO+totals.USD*summary.expectedGeneralRate-summary.expectedGeneral.NIO;
    const accountDifferences=balances.flatMap(balance=>{
      const fields=balance.entity==='TELEDOLAR'
        ? [{field:'pagos',system:Number(balance.system_income),calculated:Number(balance.income)},
          {field:'envios',system:Number(balance.system_expense),calculated:Number(balance.expense)}]
        : [{field:'saldo',system:Number(balance.system),calculated:Number(balance.calculated)}];
      return fields.map(field=>({...field,accountId:balance.account_id as string,account:balance.account as string,
        currency:balance.currency as string,difference:field.system-field.calculated})).filter(field=>Math.abs(field.difference)>=0.005);
    });
    const hasDifferences=Math.abs(cashDifference)>=0.005 || Number(row.cambio_nio)!==0
      || balances.some(balance=>Math.abs(Number(balance.difference))>=0.005
        || (balance.entity==='TELEDOLAR' && (Math.abs(Number(balance.system_income)-Number(balance.income))>=0.005
          || Math.abs(Number(balance.system_expense)-Number(balance.expense))>=0.005)));
    return {counts,totals,balances,summary,day:row.day,branchId:row.id_sucursal,registerId:row.id_caja,
      senderId:row.id_cajero,changeNio:String(row.cambio_nio),cashDifference,hasDifferences,dollarPurchases,
      pendingCashDifference:cashDifference-Number(row.cambio_nio),accountDifferences,
      identity:{shiftCode:String(row.shift_code),branch:String(row.branch),register:String(row.register),sender:String(row.sender)}};
  }

  async finalizeHandover(client: PoolClient, sourceId: string, senderId: string, receiverId: string,
    snapshot: Awaited<ReturnType<ShiftsService['handoverSnapshot']>>, _requestId: string, observations = '', mode='CON_CIERRE') {
    const reviewing=mode==='EN_REVISION';
    const recipient=(await client.query('select nombre_completo from temo.usuarios where id_usuario=$1',[receiverId])).rows[0];
    const notes=`Traspaso del turno ${snapshot.identity.shiftCode}: ${snapshot.identity.sender} entrega a ${recipient.nombre_completo}. ${reviewing?'Cierre pendiente de aprobacion administrativa.':'Cierre confirmado por entrega aceptada.'}${observations?`\nObservaciones: ${observations}`:''}`;
    if(!reviewing)await this.persistCashCounts(client,sourceId,snapshot.registerId,senderId,'CIERRE_CONTADO',snapshot.counts);
    // Congela exclusivamente la aportacion ajena; las correcciones propias siguen recalculandose.
    await client.query(`update temo.saldos_turno_cuentas stc set
      traspaso_base_ingresos=(v.item->>'income')::numeric-coalesce(own.income,0),
      traspaso_base_egresos=(v.item->>'expense')::numeric-coalesce(own.expense,0)
      from jsonb_array_elements($2::jsonb) v(item)
      left join lateral(select sum(mc.monto) filter(where mc.direccion='ENTRA') as income,
        sum(mc.monto) filter(where mc.direccion='SALE') as expense from temo.movimientos_cuentas mc
        left join temo.transacciones tr on tr.id_transaccion=mc.id_transaccion
        left join temo.transferencias tf on tf.id_transferencia=mc.id_transferencia
        where mc.id_cuenta=(v.item->>'account_id')::uuid and
          ((tr.id_turno=$1 and tr.estado<>'ANULADA') or (tf.id_turno=$1 and tf.estado='ACTIVO'))) own on true
      where stc.id_turno=$1 and stc.id_cuenta=(v.item->>'account_id')::uuid and v.item->>'entity'='TELEDOLAR'`,[sourceId,JSON.stringify(snapshot.balances)]);
    // Copia NUMERIC desde las filas, sin redondear importes de cuentas a float.
    await client.query(`update temo.saldos_turno_cuentas stc set saldo_final_sistema=(v.item->>'system')::numeric,
      saldo_ingresos_sistema=(v.item->>'system_income')::numeric,saldo_egresos_sistema=(v.item->>'system_expense')::numeric,
      saldo_final_calculado=(v.item->>'calculated')::numeric,fecha_registro_cierre=case when $3 then null else now() end,
      ingresos_referencia_sistema=case when v.item->>'entity'='TELEDOLAR' then (v.item->>'income')::numeric else stc.ingresos_referencia_sistema end,
      egresos_referencia_sistema=case when v.item->>'entity'='TELEDOLAR' then (v.item->>'expense')::numeric else stc.egresos_referencia_sistema end
      from jsonb_array_elements($2::jsonb) v(item) where stc.id_turno=$1 and stc.id_cuenta=(v.item->>'account_id')::uuid`,
    [sourceId,JSON.stringify(snapshot.balances),reviewing]);
    await client.query(`update temo.turnos set estado=$6::temo.estado_turno,
      id_usuario_cierre=case when $7 then null else $2::uuid end,fecha_cierre=case when $7 then null else now() end,
      efectivo_final_nio=case when $7 then null else $3::numeric end,efectivo_final_usd=case when $7 then null else $4::numeric end,
      observaciones_cierre=$5,fecha_modificacion=now() where id_turno=$1`,
    [sourceId,senderId,snapshot.totals.NIO,snapshot.totals.USD,notes,reviewing?'EN_REVISION':'CERRADO',reviewing]);
    const day=await client.query(`insert into temo.jornadas(fecha,id_sucursal,id_usuario_apertura,estado)
      values($1::date,$2,$3,'ABIERTO') on conflict(fecha,id_sucursal) do update set fecha=excluded.fecha returning id_jornada`,
    [snapshot.day,snapshot.branchId,receiverId]);
    const inserted=await client.query(`insert into temo.turnos(id_jornada,id_sucursal,id_caja,id_cajero,id_usuario_apertura,
      efectivo_inicial_nio,efectivo_inicial_usd,observaciones_apertura,estado)
      values($1,$2,$3,$4,$4,$5,$6,$7,'ABIERTO') returning id_turno`,
    [day.rows[0].id_jornada,snapshot.branchId,snapshot.registerId,receiverId,snapshot.totals.NIO,snapshot.totals.USD,notes]);
    const id=inserted.rows[0].id_turno;
    await this.persistCashCounts(client,id,snapshot.registerId,receiverId,'APERTURA',snapshot.counts);
    await this.persistCashCounts(client,id,snapshot.registerId,receiverId,'ACTUAL',snapshot.counts);
    await client.query(`insert into temo.saldos_turno_cuentas(id_turno,id_cuenta,saldo_inicial,saldo_final_calculado,
      saldo_final_sistema,saldo_ingresos_sistema,saldo_egresos_sistema,ingresos_referencia_sistema,egresos_referencia_sistema,
      traspaso_base_ingresos,traspaso_base_egresos)
      select $1,(v.item->>'account_id')::uuid,
        case when v.item->>'entity'='TELEDOLAR' then 0 else (v.item->>'system')::numeric end,
        (v.item->>'system')::numeric,(v.item->>'system')::numeric,
        (v.item->>'system_income')::numeric,(v.item->>'system_expense')::numeric,
        case when v.item->>'entity'='TELEDOLAR' then (v.item->>'system_income')::numeric else null end,
        case when v.item->>'entity'='TELEDOLAR' then (v.item->>'system_expense')::numeric else null end,
        case when v.item->>'entity'='TELEDOLAR' then (v.item->>'system_income')::numeric else null end,
        case when v.item->>'entity'='TELEDOLAR' then (v.item->>'system_expense')::numeric else null end
      from jsonb_array_elements($2::jsonb) v(item)`,[id,JSON.stringify(snapshot.balances)]);
    if(reviewing)await client.query(`insert into temo.solicitudes_cierre_turno(id_turno,id_usuario_solicitud,estado,observaciones_cierre)
      values($1,$2,'PENDIENTE',$3) on conflict(id_turno) do update set estado='PENDIENTE',fecha_solicitud=now(),
        id_usuario_revision=null,fecha_revision=null,fecha_notificacion_cajero_leida=null,bloquea_cambios=false,observaciones_cierre=excluded.observaciones_cierre`,[sourceId,senderId,notes]);
    return id as string;
  }

  private async persistOpeningBalances(
    client: PoolClient,
    shiftId: string,
    branchId: string,
    balances: OpenShiftInput['balances'],
  ) {
    await client.query(
      `insert into temo.saldos_turno_cuentas (id_turno, id_cuenta, saldo_inicial)
       select $1, cb.id_cuenta, 0
       from temo.cuentas_bancarias cb
       where cb.estado = 'ACTIVO'
         and (
           not exists (select 1 from temo.cuentas_sucursales cs where cs.id_cuenta = cb.id_cuenta)
           or exists (
             select 1 from temo.cuentas_sucursales cs
             where cs.id_cuenta = cb.id_cuenta and cs.id_sucursal = $2
           )
         )
       on conflict (id_turno, id_cuenta) do nothing`,
      [shiftId, branchId],
    );

    for (const balance of balances) {
      await client.query(
        `insert into temo.saldos_turno_cuentas (
           id_turno, id_cuenta, saldo_inicial, saldo_ingresos_sistema, saldo_egresos_sistema
         )
         select $1, cb.id_cuenta, $3, $5, $6
         from temo.cuentas_bancarias cb
         where cb.alias = $2
           and (
             not exists (select 1 from temo.cuentas_sucursales cs where cs.id_cuenta = cb.id_cuenta)
             or exists (
               select 1 from temo.cuentas_sucursales cs
               where cs.id_cuenta = cb.id_cuenta and cs.id_sucursal = $4
             )
           )
         on conflict (id_turno, id_cuenta) do update set
           saldo_inicial = excluded.saldo_inicial,
           saldo_ingresos_sistema = excluded.saldo_ingresos_sistema,
           saldo_egresos_sistema = excluded.saldo_egresos_sistema`,
        [shiftId, balance.account, balance.amount, branchId, balance.income ?? null, balance.expense ?? null],
      );
    }

    // Si se corrige una apertura con movimientos existentes, alinea también el saldo calculado.
    await client.query(
      `with recalculated as (
         select
           stc.id_saldo_turno,
           stc.saldo_inicial,
           stc.saldo_final_calculado as previous_calculated,
           stc.saldo_final_sistema as previous_system,
           stc.saldo_inicial + (case when eb.codigo = 'PEX' then -1 else 1 end) * coalesce((
             select sum(case movement.direccion when 'ENTRA' then movement.monto else -movement.monto end)
             from (
               select mc.direccion, mc.monto
               from temo.movimientos_cuentas mc
               join temo.transacciones tr on tr.id_transaccion = mc.id_transaccion
               where mc.id_cuenta = stc.id_cuenta and tr.id_turno = $1 and tr.estado <> 'ANULADA'
               union all
               select mc.direccion, mc.monto
               from temo.movimientos_cuentas mc
               join temo.transferencias tf on tf.id_transferencia = mc.id_transferencia
               where mc.id_cuenta = stc.id_cuenta and tf.id_turno = $1 and tf.estado = 'ACTIVO'
             ) movement
           ), 0) as current_calculated
         from temo.saldos_turno_cuentas stc
         join temo.cuentas_bancarias cb on cb.id_cuenta = stc.id_cuenta
         join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
         where stc.id_turno = $1
       )
       update temo.saldos_turno_cuentas stc
       set
         saldo_final_sistema = recalculated.current_calculated,
         saldo_final_calculado = recalculated.current_calculated
       from recalculated
       where stc.id_saldo_turno = recalculated.id_saldo_turno`,
      [shiftId],
    );
  }

  private async persistClosingBalances(
    client: PoolClient,
    shiftId: string,
    balances: CloseShiftInput['balances'],
  ) {
    const current=await this.loadBalances(shiftId,client);
    for (const balance of balances) {
      const reference=current.find(row=>row.account===balance.account);
      await client.query(
        `update temo.saldos_turno_cuentas stc
         set
           saldo_final_calculado = stc.saldo_inicial +
             (case when eb.codigo = 'PEX' then -1 else 1 end) * coalesce((
             select sum(case mc.direccion when 'ENTRA' then mc.monto else -mc.monto end)
             from (
               select mc.direccion, mc.monto
               from temo.movimientos_cuentas mc
               join temo.transacciones tr on tr.id_transaccion = mc.id_transaccion
               where mc.id_cuenta = stc.id_cuenta and tr.id_turno = $1 and tr.estado <> 'ANULADA'
               union all
               select mc.direccion, mc.monto
               from temo.movimientos_cuentas mc
               join temo.transferencias tf on tf.id_transferencia = mc.id_transferencia
               where mc.id_cuenta = stc.id_cuenta
                 and tf.id_turno = $1
                 and tf.estado = 'ACTIVO'
             ) mc
           ), 0),
           saldo_final_sistema = $3,
           saldo_ingresos_sistema = $4,
           saldo_egresos_sistema = $5,
           ingresos_referencia_sistema = case when stc.traspaso_base_ingresos is not null then $6::numeric else stc.ingresos_referencia_sistema end,
           egresos_referencia_sistema = case when stc.traspaso_base_egresos is not null then $7::numeric else stc.egresos_referencia_sistema end,
           fecha_registro_cierre = now()
         from temo.cuentas_bancarias cb
         join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
         where stc.id_turno = $1
           and stc.id_cuenta = cb.id_cuenta
           and cb.alias = $2`,
        [shiftId, balance.account, balance.amount, balance.income ?? null, balance.expense ?? null,reference?.income??null,reference?.expense??null],
      );
    }
  }
}
