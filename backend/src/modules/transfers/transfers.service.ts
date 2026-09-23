import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { TransferInput } from './transfers.schema';

type TransferRow = QueryResultRow & {
  database_id: string;
  id_turno: string;
  estado_turno: string;
  id_cajero: string;
  id_moneda: string;
  tipo: 'EFECTIVO' | 'CUENTA_BANCARIA';
  direccion: 'ENTRA' | 'SALE';
  moneda: 'NIO' | 'USD';
  monto: string;
  estado: string;
  id_cuenta: string | null;
};

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
};

@Injectable()
export class TransfersService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: AuthenticatedUser) {
    const canManageAnyShift = this.canManageAnyShift(user);
    const result = await this.db.query(
      `${this.selectTransfer()}
       where ($1::boolean or (t.id_cajero = $2 and t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')))
       order by tr.fecha_transferencia desc`,
      [canManageAnyShift, user.id],
    );
    return result.rows;
  }

  async context(user: AuthenticatedUser) {
    const canManageAnyShift = this.canManageAnyShift(user);
    const shifts = await this.db.query(
      `select t.id_turno as id, t.id_sucursal as branch_id, concat('TUR-', lpad(t.codigo_turno::text, 6, '0')) as code,
              u.nombre_completo as cashier, s.nombre as branch, c.nombre as register
       from temo.turnos t
       join temo.usuarios u on u.id_usuario = t.id_cajero
       join temo.sucursales s on s.id_sucursal = t.id_sucursal
       join temo.cajas c on c.id_caja = t.id_caja
       where t.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
         and ($1::boolean or t.id_cajero = $2)
       order by t.fecha_apertura desc`,
      [canManageAnyShift, user.id],
    );
    const accounts = await this.db.query(
      `select cb.id_cuenta as id, cb.alias, m.codigo as currency, e.nombre_corto as entity, cs.id_sucursal as branch_id
       from temo.cuentas_bancarias cb
       join temo.monedas m on m.id_moneda = cb.id_moneda
       join temo.entidades_bancarias e on e.id_entidad = cb.id_entidad
       left join temo.cuentas_sucursales cs on cs.id_cuenta = cb.id_cuenta
       where cb.estado = 'ACTIVO'
       order by e.nombre_corto, m.codigo, cb.consecutivo`,
    );
    return { shifts: shifts.rows, accounts: accounts.rows };
  }

  async detail(id: string, user: AuthenticatedUser) {
    const transfer = await this.findAuthorized(id, user);
    const lines = await this.db.query(
      `select d.valor::float8 as denomination, td.montones_25 as "piles25", td.sueltos as loose
       from temo.transferencias_denominaciones td
       join temo.denominaciones d on d.id_denominacion = td.id_denominacion
       where td.id_transferencia = $1 order by d.orden`,
      [id],
    );
    return { ...transfer, cashLines: lines.rows };
  }

  async create(input: TransferInput, user: AuthenticatedUser) {
    return this.db.transaction(async (client) => {
      const shift = await this.resolveShift(client, input.shiftId, user);
      this.assertWritable(input, shift, user);
      const normalized = await this.validateInput(client, input, shift.id_sucursal);
      const inserted = await client.query<{ id_transferencia: string } & QueryResultRow>(
        `insert into temo.transferencias
          (id_turno, tipo, direccion, id_moneda, id_cuenta, monto, descripcion, id_usuario_creacion)
         values ($1, $2::temo.medio_monto, $3::temo.direccion_monto, $4, $5, $6, $7, $8)
         returning id_transferencia`,
        [shift.id_turno, normalized.type, normalized.direction, normalized.currencyId,
          normalized.accountId, normalized.amount, input.description, user.id],
      );
      const id = inserted.rows[0].id_transferencia;
      await this.persistCashLines(client, id, normalized.currencyId, input.cashLines);
      await this.applyEffect(client, id, shift, normalized, input.cashLines, 1);
      await this.notifyAffectedCashier(client, id, shift, normalized, input.description, user);
      return this.detailWithin(client, id);
    });
  }

  async update(id: string, input: TransferInput, user: AuthenticatedUser) {
    return this.db.transaction(async (client) => {
      const previous = await this.findAuthorized(id, user, client);
      if (previous.estado !== 'ACTIVO') throw new BadRequestException('La transferencia anulada no puede editarse.');
      this.assertEditable(previous, user);
      const shift = await this.resolveShift(client, input.shiftId ?? previous.id_turno, user, true);
      this.assertWritable(input, shift, user);
      const normalized = await this.validateInput(client, input, shift.id_sucursal);
      const oldLines = await this.loadLines(client, id);
      await this.applyEffect(client, id, shift, {
        type: previous.tipo, direction: previous.direccion, currencyId: previous.id_moneda,
        accountId: previous.id_cuenta, amount: Number(previous.monto),
      }, oldLines, -1);
      await client.query(
        `update temo.transferencias set id_turno=$2, tipo=$3, direccion=$4, id_moneda=$5, id_cuenta=$6,
           monto=$7, descripcion=$8, id_usuario_modificacion=$9, fecha_modificacion=now() where id_transferencia=$1`,
        [id, shift.id_turno, normalized.type, normalized.direction, normalized.currencyId,
          normalized.accountId, normalized.amount, input.description, user.id],
      );
      await client.query(`delete from temo.transferencias_denominaciones where id_transferencia=$1`, [id]);
      await this.persistCashLines(client, id, normalized.currencyId, input.cashLines);
      await this.applyEffect(client, id, shift, normalized, input.cashLines, 1);
      return this.detailWithin(client, id);
    });
  }

  async void(id: string, reason: string, user: AuthenticatedUser) {
    return this.db.transaction(async (client) => {
      const transfer = await this.findAuthorized(id, user, client);
      if (transfer.estado !== 'ACTIVO') throw new BadRequestException('La transferencia ya esta anulada.');
      this.assertEditable(transfer, user);
      const shift = await this.resolveShift(client, transfer.id_turno, user, true);
      const lines = await this.loadLines(client, id);
      await this.applyEffect(client, id, shift, {
        type: transfer.tipo, direction: transfer.direccion, currencyId: transfer.id_moneda,
        accountId: transfer.id_cuenta, amount: Number(transfer.monto),
      }, lines, -1);
      await client.query(
        `update temo.transferencias set estado='INACTIVO', motivo_anulacion=$2, id_usuario_anulacion=$3,
           fecha_anulacion=now(), fecha_modificacion=now() where id_transferencia=$1`,
        [id, reason, user.id],
      );
      return { ok: true };
    });
  }

  private selectTransfer() {
    return `select tr.id_transferencia as database_id,
      concat('TRF-', lpad(tr.codigo_transferencia::text, 6, '0')) as id,
      tr.id_turno, t.estado as estado_turno, t.id_cajero, tr.id_moneda, tr.id_cuenta,
      tr.fecha_transferencia, tr.tipo, tr.direccion, m.codigo as moneda, m.simbolo,
      tr.monto, coalesce(tr.descripcion,'') as descripcion, tr.estado,
      coalesce(tr.motivo_anulacion,'') as motivo_anulacion,
      eb.nombre_corto as entidad, cb.alias as cuenta,
      u.nombre_completo as cajero, s.nombre as sucursal, c.nombre as caja
      from temo.transferencias tr join temo.turnos t on t.id_turno=tr.id_turno
      join temo.monedas m on m.id_moneda=tr.id_moneda
      join temo.usuarios u on u.id_usuario=t.id_cajero join temo.sucursales s on s.id_sucursal=t.id_sucursal
      join temo.cajas c on c.id_caja=t.id_caja
      left join temo.cuentas_bancarias cb on cb.id_cuenta=tr.id_cuenta
      left join temo.entidades_bancarias eb on eb.id_entidad=cb.id_entidad`;
  }

  private async findAuthorized(id: string, user: AuthenticatedUser, client: Queryable = this.db) {
    const result = await client.query<TransferRow>(`${this.selectTransfer()} where tr.id_transferencia=$1`, [id]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('La transferencia no existe.');
    if (!this.canManageAnyShift(user) && (row.id_cajero !== user.id || !['ABIERTO','PENDIENTE_APROBACION'].includes(row.estado_turno))) {
      throw new ForbiddenException('No tiene acceso a esta transferencia.');
    }
    return row;
  }

  private async resolveShift(client: PoolClient, requested: string | undefined, user: AuthenticatedUser, allowClosed = false) {
    const result = await client.query(
      `select t.id_turno, t.id_sucursal, t.id_caja, t.id_cajero, t.estado
       from temo.turnos t where ${requested ? 't.id_turno=$1' : "t.id_cajero=$1 and t.estado in ('ABIERTO','PENDIENTE_APROBACION')"}
       order by t.fecha_apertura desc limit 1`,
      [requested ?? user.id],
    );
    const shift = result.rows[0];
    if (!shift) throw new BadRequestException('No existe un turno disponible para la transferencia.');
    if (!this.canManageAnyShift(user) && shift.id_cajero !== user.id) throw new ForbiddenException('El turno no pertenece al cajero autenticado.');
    if (!allowClosed && !['ABIERTO','PENDIENTE_APROBACION'].includes(shift.estado)) throw new BadRequestException('El turno seleccionado no esta abierto.');
    return shift;
  }

  private assertWritable(input: TransferInput, shift: Record<string,string>, user: AuthenticatedUser) {
    if (!this.canManageAnyShift(user) && (input.type !== 'EFECTIVO' || input.direction !== 'EGRESO')) {
      throw new ForbiddenException('El cajero solo puede registrar egresos de efectivo en su turno abierto.');
    }
    if (!this.canManageAnyShift(user) && !['ABIERTO','PENDIENTE_APROBACION'].includes(shift.estado)) throw new ForbiddenException('El turno no esta abierto.');
  }

  private assertEditable(row: TransferRow, user: AuthenticatedUser) {
    if (!this.canManageAnyShift(user) && (row.tipo !== 'EFECTIVO' || row.direccion !== 'SALE' || row.id_cajero !== user.id || !['ABIERTO','PENDIENTE_APROBACION'].includes(row.estado_turno))) {
      throw new ForbiddenException('Solo puede modificar egresos de efectivo de su turno abierto.');
    }
  }

  private async validateInput(client: PoolClient, input: TransferInput, branchId: string) {
    const currency = await client.query(`select id_moneda from temo.monedas where codigo=$1 and estado='ACTIVO'`, [input.currency]);
    const currencyId = currency.rows[0]?.id_moneda;
    if (!currencyId) throw new NotFoundException('La moneda seleccionada no existe.');
    const type = input.type === 'DIGITAL' ? 'CUENTA_BANCARIA' : 'EFECTIVO';
    const direction = input.direction === 'EGRESO' ? 'SALE' : 'ENTRA';
    let accountId: string | null = null;
    if (type === 'CUENTA_BANCARIA') {
      if (!input.accountId) throw new BadRequestException('Debe seleccionar una cuenta bancaria.');
      const account = await client.query(
        `select cb.id_cuenta from temo.cuentas_bancarias cb
         where cb.id_cuenta=$1 and cb.id_moneda=$2 and cb.estado='ACTIVO'
           and (not exists(select 1 from temo.cuentas_sucursales x where x.id_cuenta=cb.id_cuenta)
             or exists(select 1 from temo.cuentas_sucursales x where x.id_cuenta=cb.id_cuenta and x.id_sucursal=$3))`,
        [input.accountId, currencyId, branchId],
      );
      if (!account.rowCount) throw new BadRequestException('La cuenta no corresponde a la moneda o sucursal del turno.');
      accountId = input.accountId;
    }
    const counted = input.cashLines.reduce((sum, line) => sum + line.denomination * (line.piles25 * 25 + line.loose), 0);
    if (type === 'EFECTIVO' && Math.abs(counted - input.amount) > 0.005) throw new BadRequestException('El arqueo debe coincidir con el monto de la transferencia.');
    return { type, direction, currencyId, accountId, amount: input.amount };
  }

  private async persistCashLines(client: PoolClient, id: string, currencyId: string, lines: TransferInput['cashLines']) {
    for (const line of lines.filter((item) => item.piles25 || item.loose)) {
      const denomination = await client.query(`select id_denominacion from temo.denominaciones where id_moneda=$1 and valor=$2`, [currencyId, line.denomination]);
      if (!denomination.rowCount) throw new BadRequestException(`No existe la denominacion ${line.denomination}.`);
      await client.query(`insert into temo.transferencias_denominaciones(id_transferencia,id_denominacion,montones_25,sueltos) values($1,$2,$3,$4)`, [id, denomination.rows[0].id_denominacion, line.piles25, line.loose]);
    }
  }

  private async loadLines(client: PoolClient, id: string) {
    const result = await client.query(`select d.valor::float8 as denomination, td.montones_25 as "piles25", td.sueltos as loose from temo.transferencias_denominaciones td join temo.denominaciones d on d.id_denominacion=td.id_denominacion where td.id_transferencia=$1`, [id]);
    return result.rows;
  }

  private async applyEffect(client: PoolClient, id: string, shift: Record<string,string>, effect: { type:string; direction:string; currencyId:string; accountId:string|null; amount:number }, lines: Array<{denomination:number;piles25:number;loose:number}>, factor: 1|-1) {
    const direction = factor === 1 ? effect.direction : (effect.direction === 'ENTRA' ? 'SALE' : 'ENTRA');
    if (effect.type === 'EFECTIVO') {
      await client.query(`insert into temo.movimientos_efectivo(id_transferencia,id_turno,id_caja,id_moneda,direccion,monto,es_reverso) values($1,$2,$3,$4,$5,$6,$7)`, [id, shift.id_turno, shift.id_caja, effect.currencyId, direction, effect.amount, factor === -1]);
      const sign = (effect.direction === 'ENTRA' ? 1 : -1) * factor;
      await this.adjustCurrentCash(client, shift, effect.currencyId, lines, sign);
    } else {
      await client.query(`insert into temo.movimientos_cuentas(id_transferencia,id_cuenta,id_moneda,direccion,monto,es_reverso) values($1,$2,$3,$4,$5,$6)`, [id, effect.accountId, effect.currencyId, direction, effect.amount, factor === -1]);
    }
  }

  // Avisa al cajero afectado y a los Administradores activos sin duplicar al usuario que registra.
  private async notifyAffectedCashier(
    client: PoolClient,
    transferId: string,
    shift: Record<string, string>,
    transfer: { type: string; direction: string; amount: number },
    description: string,
    user: AuthenticatedUser,
  ) {
    const detail = description.trim();
    await client.query(
      `insert into temo.notificaciones_usuarios (
         id_usuario_destino, tipo, titulo, mensaje, id_transferencia, id_turno, id_usuario_origen
       )
       select recipients.id_usuario, 'TRANSFERENCIA_REGISTRADA', $1, $2, $3, $4, $5
       from (
         select $6::uuid as id_usuario
         union
         select u.id_usuario
         from temo.usuarios u
         join temo.roles r on r.id_rol = u.id_rol
         where r.codigo = 'JEFA' and u.estado = 'ACTIVO'
       ) recipients
       where recipients.id_usuario is not null and recipients.id_usuario <> $5`,
      [
        'Transferencia aplicada a un turno',
        detail,
        transferId,
        shift.id_turno,
        user.id,
        shift.id_cajero,
      ],
    );
  }

  // Administrador y Operador de transferencias trabajan sobre cualquier turno activo.
  private canManageAnyShift(user: AuthenticatedUser) {
    return ['JEFA', 'TRANSFERISTA'].includes(user.roleCode);
  }

  private async adjustCurrentCash(client: PoolClient, shift: Record<string,string>, currencyId: string, lines: Array<{denomination:number;piles25:number;loose:number}>, sign: number) {
    let cash = await client.query(
      `select id_arqueo from temo.arqueos
       where id_turno=$1 and id_moneda=$2 and tipo='ACTUAL'
       order by fecha_creacion desc limit 1 for update`,
      [shift.id_turno, currencyId],
    );
    if (!cash.rowCount) cash = await client.query(`insert into temo.arqueos(id_turno,id_caja,tipo,id_moneda,monto_total,id_usuario_creacion) values($1,$2,'ACTUAL',$3,0,$4) returning id_arqueo`, [shift.id_turno, shift.id_caja, currencyId, shift.id_cajero]);
    const cashId = cash.rows[0].id_arqueo;
    for (const line of lines) {
      const d = await client.query(`select id_denominacion from temo.denominaciones where id_moneda=$1 and valor=$2`, [currencyId, line.denomination]);
      if (!d.rowCount) throw new BadRequestException(`No existe la denominacion ${line.denomination}.`);
      const delta = (line.piles25 * 25 + line.loose) * sign;
      if (!delta) continue;
      const existing = await client.query<{ quantity: number } & QueryResultRow>(
        `select cantidad::integer as quantity from temo.arqueos_denominaciones
         where id_arqueo=$1 and id_denominacion=$2 for update`,
        [cashId, d.rows[0].id_denominacion],
      );
      const quantity = Number(existing.rows[0]?.quantity ?? 0) + delta;
      if (quantity < 0) {
        throw new BadRequestException(
          `No hay suficientes billetes de ${line.denomination} para realizar el egreso. Disponibles: ${existing.rows[0]?.quantity ?? 0}.`,
        );
      }
      await client.query(
        `insert into temo.arqueos_denominaciones(id_arqueo,id_denominacion,cantidad,monto,montones_25,sueltos)
         values($1,$2,$3::integer,$3::integer*$4::numeric,floor($3::integer/25.0)::integer,mod($3::integer,25))
         on conflict(id_arqueo,id_denominacion) do update set
           cantidad=excluded.cantidad, monto=excluded.monto,
           montones_25=excluded.montones_25, sueltos=excluded.sueltos`,
        [cashId, d.rows[0].id_denominacion, quantity, line.denomination],
      );
    }
    await client.query(`update temo.arqueos a set monto_total=coalesce((select sum(ad.monto) from temo.arqueos_denominaciones ad where ad.id_arqueo=a.id_arqueo),0), fecha_creacion=now() where a.id_arqueo=$1`, [cashId]);
  }

  private async detailWithin(client: PoolClient, id: string) {
    const result = await client.query(`${this.selectTransfer()} where tr.id_transferencia=$1`, [id]);
    return result.rows[0];
  }
}
