import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
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
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const result = await this.db.query<ShiftRow>(
      `${this.shiftSelect()}
       where ($1 = 'JEFA' or t.id_cajero = $2)
       order by t.fecha_apertura desc`,
      [user.roleCode, user.id],
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

  async current(user: AuthenticatedUser) {
    const shift = await this.findCurrentShift(user);
    if (!shift) {
      return null;
    }
    await this.ensureCurrentCashCount(shift.database_id, user.id);
    return this.detail(shift.database_id, user);
  }

  async detail(shiftId: string, user: AuthenticatedUser) {
    const shift = await this.findAuthorizedShift(shiftId, user);
    const cashCounts = await this.loadCashCounts(shiftId);
    const balances = await this.loadBalances(shiftId);
    const availableAccounts = await this.loadAvailableAccounts(shift.id_sucursal);
    const availableMovements = await this.loadAvailableMovements(shift.id_sucursal);
    const cashSummary = await this.loadCashSummary(shiftId);
    return {
      ...shift,
      cashCounts,
      balances,
      availableAccounts,
      availableMovements,
      ...cashSummary,
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
         where id_cajero = $1 and estado in ('ABIERTO', 'PENDIENTE_APROBACION')`,
        [cashierId],
      );
      if (existing.rowCount) {
        throw new ConflictException('El cajero ya tiene un turno abierto.');
      }

      const registerResult = await client.query<{ id_caja: string } & QueryResultRow>(
        `select c.id_caja
         from temo.cajas c
         where c.id_sucursal = $1
           and c.estado = 'ACTIVO'
           and not exists (
             select 1 from temo.turnos t
             where t.id_caja = c.id_caja
               and t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
           )
         order by
           case when lower(c.nombre) = lower($2) then 0 else 1 end,
           c.nombre
         limit 1`,
        [branchId, input.register],
      );
      const registerId = registerResult.rows[0]?.id_caja;
      if (!registerId) {
        throw new ConflictException('No hay una caja disponible en la sucursal.');
      }

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
           efectivo_inicial_nio, efectivo_inicial_usd, observaciones_apertura
         ) values ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''))
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

  async update(shiftId: string, input: UpdateShiftInput, user: AuthenticatedUser) {
    this.requireBoss(user);
    const currentShift = await this.findAuthorizedShift(shiftId, user, true);
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
           and estado in ('ABIERTO', 'PENDIENTE_APROBACION')`,
        [cashierId, shiftId],
      );
      if (cashierConflict.rowCount) {
        throw new ConflictException('El cajero seleccionado ya tiene otro turno abierto.');
      }

      const registerResult = await client.query<{ id_caja: string } & QueryResultRow>(
        `select c.id_caja from temo.cajas c
         where c.id_sucursal = $1 and lower(c.nombre) = lower($2) and c.estado = 'ACTIVO'
           and not exists (
             select 1 from temo.turnos t
             where t.id_caja = c.id_caja and t.id_turno <> $3
               and t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
           ) limit 1`,
        [branchId, input.register, shiftId],
      );
      const registerId = registerResult.rows[0]?.id_caja;
      if (!registerId) {
        throw new ConflictException('La caja seleccionada no esta disponible en esa sucursal.');
      }

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
        await client.query(`update temo.turnos set estado = 'ABIERTO' where id_turno = $1`, [shiftId]);
      }
    });
    return this.detail(shiftId, user);
  }

  async saveCashCount(shiftId: string, input: SaveCashCountInput, user: AuthenticatedUser) {
    const shift = await this.findAuthorizedShift(shiftId, user, true);
    await this.db.transaction(async (client) => {
      await this.persistCashCounts(client, shiftId, shift.id_caja, user.id, 'ACTUAL', input.counts);
      await client.query(
        `update temo.turnos
         set cambio_nio = $2, fecha_modificacion = now()
         where id_turno = $1`,
        [shiftId, input.changeNio],
      );
    });
    return this.detail(shiftId, user);
  }

  async updateClosed(shiftId: string, input: UpdateClosedShiftInput, user: AuthenticatedUser) {
    this.requireBoss(user);
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
    balances: Array<{ account: string; amount: number }>,
    user: AuthenticatedUser,
  ) {
    await this.findAuthorizedShift(shiftId, user, true);
    await this.db.transaction(async (client) => {
      for (const balance of balances) {
        await client.query(
          `update temo.saldos_turno_cuentas stc
           set saldo_final_sistema = $3
           from temo.cuentas_bancarias cb
           where stc.id_turno = $1
             and stc.id_cuenta = cb.id_cuenta
             and cb.alias = $2`,
          [shiftId, balance.account, balance.amount],
        );
      }
    });
    return this.detail(shiftId, user);
  }

  async requestClose(shiftId: string, user: AuthenticatedUser) {
    const shift = await this.findAuthorizedShift(shiftId, user, true);
    if (shift.id_cajero !== user.id) {
      throw new ForbiddenException('Solo el cajero del turno puede solicitar su cierre.');
    }
    const result = await this.db.query(
      `insert into temo.solicitudes_cierre_turno (
         id_turno, id_usuario_solicitud, estado, fecha_solicitud,
         id_usuario_revision, fecha_revision, fecha_notificacion_cajero_leida,
         observaciones_cierre
       ) values ($1, $2, 'PENDIENTE', now(), null, null, null, null)
       on conflict (id_turno) do update set
         id_usuario_solicitud = excluded.id_usuario_solicitud,
         estado = 'PENDIENTE',
         fecha_solicitud = now(),
         id_usuario_revision = null,
         fecha_revision = null,
         fecha_notificacion_cajero_leida = null,
         observaciones_cierre = null
       returning id_solicitud_cierre as id`,
      [shiftId, user.id],
    );
    await this.db.query(
      `update temo.turnos
       set estado = 'PENDIENTE_APROBACION', fecha_modificacion = now()
       where id_turno = $1`,
      [shiftId],
    );
    return result.rows[0];
  }

  async notifications(user: AuthenticatedUser) {
    if (user.roleCode === 'JEFA') {
      const result = await this.db.query(
        `select
           sc.id_solicitud_cierre as id,
           'CLOSE_REQUEST' as kind,
           t.id_turno as shift_id,
           concat('TUR-', upper(substr(replace(t.id_turno::text, '-', ''), 1, 8))) as shift_code,
           u.nombre_completo as cashier,
           s.nombre as branch,
           c.nombre as register,
           sc.fecha_solicitud as created_at,
           null::text as observations,
           null::numeric as amount,
           null::text as currency
         from temo.solicitudes_cierre_turno sc
         join temo.turnos t on t.id_turno = sc.id_turno
         join temo.usuarios u on u.id_usuario = t.id_cajero
         join temo.sucursales s on s.id_sucursal = t.id_sucursal
         join temo.cajas c on c.id_caja = t.id_caja
         where sc.estado = 'PENDIENTE'
         order by sc.fecha_solicitud`,
      );
      return result.rows;
    }

    const result = await this.db.query(
      `select
         sc.id_solicitud_cierre as id,
         'SHIFT_CLOSED' as kind,
         t.id_turno as shift_id,
         concat('TUR-', upper(substr(replace(t.id_turno::text, '-', ''), 1, 8))) as shift_code,
         u.nombre_completo as cashier,
         s.nombre as branch,
         c.nombre as register,
         sc.fecha_revision as created_at,
         coalesce(sc.observaciones_cierre, '') as observations,
         null::numeric as amount,
         null::text as currency
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
         'PENDING_PAID' as kind,
         n.id_turno as shift_id,
         concat('TUR-', upper(substr(replace(t.id_turno::text, '-', ''), 1, 8))) as shift_code,
         coalesce(cp.nombre, u.nombre_completo) as cashier,
         s.nombre as branch,
         c.nombre as register,
         n.fecha_creacion as created_at,
         n.mensaje as observations,
         payment.monto as amount,
         payment.moneda as currency
       from temo.notificaciones_usuarios n
       left join temo.turnos t on t.id_turno = n.id_turno
       left join temo.usuarios u on u.id_usuario = t.id_cajero
       left join temo.sucursales s on s.id_sucursal = t.id_sucursal
       left join temo.cajas c on c.id_caja = t.id_caja
       left join temo.pagos_pendientes pp on pp.id_pendiente = n.id_pendiente
       left join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
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
           id_usuario, accion, tabla, id_registro, datos_nuevos
         ) values (
           $1, 'APROBAR', 'turnos', $2,
           jsonb_build_object('estado', 'CERRADO', 'observaciones', nullif($3, ''))
         )`,
        [user.id, shiftId, input.observations],
      );
    });
    return this.detail(shiftId, user);
  }

  private shiftSelect() {
    return `select
       t.id_turno as database_id,
       concat('TUR-', upper(substr(replace(t.id_turno::text, '-', ''), 1, 8))) as id,
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
       sc.estado as solicitud_estado
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
         and t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
       order by t.fecha_apertura desc
       limit 1`,
      [user.id],
    );
    return result.rows[0] ?? null;
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
         ${requireOpen ? "and t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')" : ''}
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
      throw new ForbiddenException('Esta operacion requiere el perfil Jefa.');
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

  private async loadCashCounts(shiftId: string) {
    const result = await this.db.query<{
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

  private async loadBalances(shiftId: string) {
    const result = await this.db.query(
      `select
         stc.id_cuenta as account_id,
         cb.alias as account,
         eb.codigo as entity,
         m.codigo as currency,
         stc.saldo_inicial as initial,
         coalesce(movements.income, 0) as income,
         coalesce(movements.expense, 0) as expense,
         stc.saldo_inicial
           + coalesce(movements.income, 0)
           - coalesce(movements.expense, 0) as calculated,
         stc.saldo_final_sistema as system,
         case
           when stc.saldo_final_sistema is null then null
           else stc.saldo_final_sistema - (
             stc.saldo_inicial
             + coalesce(movements.income, 0)
             - coalesce(movements.expense, 0)
           )
         end as difference
       from temo.saldos_turno_cuentas stc
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
           where mc.id_cuenta = stc.id_cuenta and tr.id_turno = stc.id_turno and tr.estado <> 'ANULADA'
           union all
           select mc.direccion, mc.monto
           from temo.movimientos_cuentas mc
           join temo.transferencias tf on tf.id_transferencia = mc.id_transferencia
           where mc.id_cuenta = stc.id_cuenta
             and tf.id_turno = stc.id_turno
             and tf.estado = 'ACTIVO'
         ) mc
       ) movements on true
       where stc.id_turno = $1
         and (
           cb.estado = 'ACTIVO'
           or stc.saldo_inicial <> 0
           or stc.saldo_final_sistema is not null
           or coalesce(movements.income, 0) <> 0
           or coalesce(movements.expense, 0) <> 0
         )
       order by m.codigo, eb.codigo, cb.alias`,
      [shiftId],
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

  private async loadCashSummary(shiftId: string) {
    const result = await this.db.query<{
      currency: CurrencyCode;
      expected_amount: string;
      pending_amount: string;
    } & QueryResultRow>(
      `select
         m.codigo as currency,
         (
           case when m.codigo = 'NIO' then t.efectivo_inicial_nio else t.efectivo_inicial_usd end
           + coalesce(transaction_cash.amount, 0)
           + coalesce(paid_pending_cash.amount, 0)
           + coalesce(transfer_cash.amount, 0)
         ) as expected_amount,
         coalesce(open_pending.amount, 0) as pending_amount
       from temo.turnos t
       cross join temo.monedas m
       /* Las transacciones de credito no afectan efectivo hasta liquidarse. */
       left join lateral (
         select sum(case tm.direccion when 'ENTRA' then tm.monto else -tm.monto end) as amount
         from temo.transacciones tr
         join temo.transacciones_montos tm on tm.id_transaccion = tr.id_transaccion
         where tr.id_turno = t.id_turno
           and tr.estado <> 'ANULADA'
           and tm.id_moneda = m.id_moneda
           and tm.medio = 'EFECTIVO'
       ) transaction_cash on true
       /* Una liquidacion afecta efectivo salvo que se haya registrado por cuenta bancaria. */
       left join lateral (
         select sum(case pp.tipo when 'POR_COBRAR' then ap.monto else -ap.monto end) as amount
         from temo.abonos_pendientes ap
         join temo.pagos_pendientes pp on pp.id_pendiente = ap.id_pendiente
         where ap.id_turno_aplicacion = t.id_turno
           and ap.id_moneda = m.id_moneda
           and not exists (
             select 1 from temo.transacciones_montos payment_tm
             where payment_tm.id_transaccion = ap.id_transaccion
               and payment_tm.medio = 'CUENTA_BANCARIA'
           )
       ) paid_pending_cash on true
       /* Las transferencias de efectivo modifican el valor esperado por su direccion. */
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
    );
    return result.rows.reduce<{
      expectedCash: Record<CurrencyCode, number>;
      pendingCash: Record<CurrencyCode, number>;
    }>((summary, row) => {
      summary.expectedCash[row.currency] = Number(row.expected_amount);
      summary.pendingCash[row.currency] = Number(row.pending_amount);
      return summary;
    }, { expectedCash: { NIO: 0, USD: 0 }, pendingCash: { NIO: 0, USD: 0 } });
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
        `insert into temo.saldos_turno_cuentas (id_turno, id_cuenta, saldo_inicial)
         select $1, cb.id_cuenta, $3
         from temo.cuentas_bancarias cb
         where cb.alias = $2
           and (
             not exists (select 1 from temo.cuentas_sucursales cs where cs.id_cuenta = cb.id_cuenta)
             or exists (
               select 1 from temo.cuentas_sucursales cs
               where cs.id_cuenta = cb.id_cuenta and cs.id_sucursal = $4
             )
           )
         on conflict (id_turno, id_cuenta) do update set saldo_inicial = excluded.saldo_inicial`,
        [shiftId, balance.account, balance.amount, branchId],
      );
    }
  }

  private async persistClosingBalances(
    client: PoolClient,
    shiftId: string,
    balances: CloseShiftInput['balances'],
  ) {
    for (const balance of balances) {
      await client.query(
        `update temo.saldos_turno_cuentas stc
         set
           saldo_final_calculado = stc.saldo_inicial + coalesce((
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
           fecha_registro_cierre = now()
         from temo.cuentas_bancarias cb
         where stc.id_turno = $1
           and stc.id_cuenta = cb.id_cuenta
           and cb.alias = $2`,
        [shiftId, balance.account, balance.amount],
      );
    }
  }
}
