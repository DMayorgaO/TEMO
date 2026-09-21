import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient, QueryResultRow } from 'pg';
import { AuthenticatedUser } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import {
  CreateTransactionBatchInput,
  PayPendingBatchInput,
  PayPendingInput,
  UpdateTransactionInput,
} from './transaction-batch.schema';

type CurrencyCode = 'NIO' | 'USD';
type MoneyDirection = 'ENTRA' | 'SALE';
type RateKind = 'COMPRA' | 'VENTA';

interface ShiftRow extends QueryResultRow {
  id_turno: string;
  id_sucursal: string;
  id_caja: string;
  id_cajero: string;
}

interface MovementRow extends QueryResultRow {
  id_cuenta_movimiento: string;
  id_cuenta: string;
  id_movimiento: string;
  id_entidad: string;
  id_moneda: string;
  nombre_operativo: string;
  direccion_efectivo: MoneyDirection | null;
  afecta_cuenta: boolean;
  direccion_cuenta: MoneyDirection | null;
  genera_pendiente: boolean;
  tipo_pendiente: 'POR_COBRAR' | 'POR_PAGAR' | null;
}

interface CurrencyRow extends QueryResultRow {
  id_moneda: string;
  codigo: CurrencyCode;
}

interface DenominationRow extends QueryResultRow {
  id_denominacion: string;
  id_moneda: string;
  codigo_moneda: CurrencyCode;
  valor: string;
}

interface CommissionRuleRow extends QueryResultRow {
  id_comision: string;
  id_moneda_comision: string | null;
  tipo_calculo: 'PORCENTAJE' | 'FIJO' | 'RANGO' | 'MANUAL';
  porcentaje: string | null;
  monto_fijo: string | null;
}

interface EditableTransactionRow extends QueryResultRow {
  id_transaccion: string;
  id_grupo_transacciones: string;
  id_turno: string;
  id_sucursal: string;
  id_caja: string;
  id_cajero: string;
  estado_turno: string;
  estado_transaccion: string;
  id_pendiente: string | null;
  estado_pendiente: string | null;
}

type CashCounts = CreateTransactionBatchInput['settlement']['primaryCounts'];

interface StoredSettlement {
  independent: boolean;
  primaryDirection: MoneyDirection;
  primaryCounts: CashCounts;
  changeCounts: CashCounts;
}

export interface PersistedTransaction {
  id: string;
  order: number;
  entityCode: string;
  movementCode: string;
  movement: string;
  currencyCode: CurrencyCode;
  amount: number;
  direction: MoneyDirection;
  pendingName: string;
  description: string;
}

interface RequestAudit {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly db: DatabaseService) {}

  createBatch(input: CreateTransactionBatchInput, audit: RequestAudit) {
    return this.db.transaction(async (client) => {
      const shift = await this.resolveShift(client, input);
      const userId = await this.resolveUser(client, input.userId, shift.id_cajero);
      const currencies = await this.loadCurrencies(client);
      const rateId = await this.resolveExchangeRate(client, input, userId);
      const methods = await this.loadPaymentMethods(client);
      const counterpartIds = new Map<string, string>();

      for (const transaction of input.transactions) {
        if (transaction.pendingName) {
          counterpartIds.set(
            transaction.pendingName,
            await this.resolveCounterpart(
              client,
              transaction.pendingName,
            ),
          );
        }
      }

      const firstCounterpartId =
        counterpartIds.values().next().value as string | undefined;
      const groupResult = await client.query<{
        id_grupo_transacciones: string;
        codigo_operacion: string;
      } & QueryResultRow>(
        `insert into temo.grupos_transacciones (
           id_turno,
           id_contraparte,
           id_tipo_cambio_vuelto,
           tipo_tasa_vuelto,
           tasa_vuelto_usada,
           id_usuario_creacion
         )
         values ($1, $2, $3, $4, $5, $6)
         returning id_grupo_transacciones, codigo_operacion`,
        [
          shift.id_turno,
          firstCounterpartId ?? null,
          rateId,
          input.settlement.changeRateKind,
          this.rateValue(input, input.settlement.changeRateKind),
          userId,
        ],
      );
      const group = groupResult.rows[0];

      const consecutiveResult = await client.query<{ next_value: number } & QueryResultRow>(
        `select coalesce(max(consecutivo_turno), 0)::integer + 1 as next_value
         from temo.transacciones
         where id_turno = $1`,
        [shift.id_turno],
      );
      const firstConsecutive = consecutiveResult.rows[0].next_value;
      const persisted: PersistedTransaction[] = [];
      const expectedNet: Record<CurrencyCode, number> = { NIO: 0, USD: 0 };
      let expectedNetNio = 0;

      for (const [index, transaction] of input.transactions.entries()) {
        const movement = await this.resolveMovement(
          client,
          shift.id_sucursal,
          transaction.entityCode,
          transaction.currencyCode,
          transaction.movementCode,
        );
        if (!movement.direccion_efectivo) {
          throw new ConflictException(
            `El movimiento ${transaction.movementCode} no tiene direccion de efectivo configurada.`,
          );
        }

        const direction = movement.direccion_efectivo;
        const sign = direction === 'ENTRA' ? 1 : -1;
        const rateKind = this.transactionRateKind(
          direction,
          transaction.currencyCode,
        );
        const conversionRate = this.rateValue(input, rateKind);
        expectedNet[transaction.currencyCode] += sign * transaction.amount;
        expectedNetNio +=
          sign *
          (transaction.currencyCode === 'USD'
            ? transaction.amount * conversionRate
            : transaction.amount);

        const counterpartId = transaction.pendingName
          ? counterpartIds.get(transaction.pendingName) ?? null
          : null;
        const methodId = transaction.pendingName
          ? methods.CREDITO
          : methods.EFECTIVO;
        const transactionResult = await client.query<{
          id_transaccion: string;
        } & QueryResultRow>(
          `insert into temo.transacciones (
             id_turno,
             id_sucursal,
             id_caja,
             id_cajero,
             id_cuenta_movimiento,
             id_contraparte,
             id_metodo_pago,
             id_moneda_original,
             monto_original,
             id_tipo_cambio,
             tasa_compra_usada,
             tasa_venta_usada,
             descripcion,
             consecutivo_turno,
             id_usuario_creacion,
             id_grupo_transacciones,
             orden_grupo
           )
           values (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17
           )
           returning id_transaccion`,
          [
            shift.id_turno,
            shift.id_sucursal,
            shift.id_caja,
            shift.id_cajero,
            movement.id_cuenta_movimiento,
            counterpartId,
            methodId,
            movement.id_moneda,
            transaction.amount,
            rateId,
            input.rates.buy,
            input.rates.sell,
            transaction.description || null,
            firstConsecutive + index,
            userId,
            group.id_grupo_transacciones,
            index + 1,
          ],
        );
        const transactionId = transactionResult.rows[0].id_transaccion;

        await client.query(
          `insert into temo.transacciones_montos (
             id_transaccion, direccion, medio, id_moneda, monto, observaciones
           )
           values ($1, $2, $3, $4, $5, $6)`,
          [
            transactionId,
            direction,
            transaction.pendingName ? 'CREDITO' : 'EFECTIVO',
            movement.id_moneda,
            transaction.amount,
            transaction.pendingName
              ? `Pendiente: ${transaction.pendingName}`
              : null,
          ],
        );

        if (movement.afecta_cuenta && movement.direccion_cuenta) {
          await client.query(
            `insert into temo.movimientos_cuentas (
               id_transaccion, id_cuenta, id_moneda, direccion, monto
             )
             values ($1, $2, $3, $4, $5)`,
            [
              transactionId,
              movement.id_cuenta,
              movement.id_moneda,
              movement.direccion_cuenta,
              transaction.amount,
            ],
          );
        }

        if (transaction.pendingName && counterpartId) {
          const pendingType =
            movement.tipo_pendiente ??
            (direction === 'ENTRA' ? 'POR_COBRAR' : 'POR_PAGAR');
          const pendingResult = await client.query<{ id_pendiente: string } & QueryResultRow>(
            `insert into temo.pagos_pendientes (
               id_transaccion,
               tipo,
               id_contraparte,
               id_moneda,
               monto_original,
               saldo_pendiente,
               observaciones,
               id_usuario_creacion
             )
             values ($1, $2, $3, $4, $5, $5, $6, $7)
             returning id_pendiente`,
            [
              transactionId,
              pendingType,
              counterpartId,
              movement.id_moneda,
              transaction.amount,
              transaction.description || null,
              userId,
            ],
          );
          await client.query(
            `insert into temo.historial_pendientes (
               id_pendiente, estado_anterior, estado_nuevo, id_usuario, motivo
             ) values ($1, null, 'PENDIENTE', $2, 'Estado inicial del pendiente')`,
            [pendingResult.rows[0].id_pendiente, userId],
          );
        }

        await this.persistCommission(
          client,
          transactionId,
          movement,
          transaction.amount,
        );

        persisted.push({
          id: transactionId,
          order: index + 1,
          entityCode: transaction.entityCode.toUpperCase(),
          movementCode: transaction.movementCode.toUpperCase(),
          movement: movement.nombre_operativo,
          currencyCode: transaction.currencyCode,
          amount: transaction.amount,
          direction,
          pendingName: transaction.pendingName,
          description: transaction.description,
        });
      }

      const denominations = await this.loadDenominations(client);
      const primaryDirection: MoneyDirection =
        expectedNetNio < 0 ? 'SALE' : 'ENTRA';
      const primaryType =
        primaryDirection === 'ENTRA'
          ? 'TRANSACCION_RECIBIDO'
          : 'TRANSACCION_ENTREGADO';
      const primaryTotals = this.cashTotals(input.settlement.primaryCounts);
      const changeTotals = this.cashTotals(input.settlement.changeCounts);
      // Un pendiente representa el monto completo a credito y no mueve efectivo al crearse.
      if (
        input.transactions.some((transaction) => transaction.pendingName) &&
        input.transactions.some((transaction) => {
          const settlement = transaction.settlement ?? input.settlement;
          const primary = this.cashTotals(settlement.primaryCounts);
          const change = this.cashTotals(settlement.changeCounts);
          return primary.NIO > 0 || primary.USD > 0 || change.NIO > 0 || change.USD > 0;
        })
      ) {
        throw new ConflictException(
          'Un pendiente total no puede guardarse con billetes ni vuelto. Limpie el arqueo e intente nuevamente.',
        );
      }

      const hasIndependentSettlements = input.transactions.some((transaction) => transaction.settlement);
      if (hasIndependentSettlements) {
        await this.persistIndependentSettlements(client, input, persisted, shift, rateId, userId, currencies, denominations);
      } else {
        for (const currency of ['NIO', 'USD'] as const) {
        if (
          primaryTotals[currency] > 0 ||
          Math.abs(expectedNet[currency]) > 0
        ) {
          await this.persistCashCount(client, {
            groupId: group.id_grupo_transacciones,
            shift,
            userId,
            rateId,
            rateKind: input.settlement.primaryRateKind,
            rateValue: this.rateValue(
              input,
              input.settlement.primaryRateKind,
            ),
            currency,
            currencyId: currencies[currency],
            type: primaryType,
            expectedAmount: Math.abs(expectedNet[currency]),
            lines: input.settlement.primaryCounts[currency],
            denominations,
          });
        }

        if (
          changeTotals[currency] > 0 ||
          input.settlement.expectedChange[currency] > 0
        ) {
          await this.persistCashCount(client, {
            groupId: group.id_grupo_transacciones,
            shift,
            userId,
            rateId,
            rateKind: input.settlement.changeRateKind,
            rateValue: this.rateValue(
              input,
              input.settlement.changeRateKind,
            ),
            currency,
            currencyId: currencies[currency],
            type: 'TRANSACCION_VUELTO',
            expectedAmount: input.settlement.expectedChange[currency],
            lines: input.settlement.changeCounts[currency],
            denominations,
          });
        }

        if (primaryTotals[currency] > 0) {
          await this.persistCashMovement(
            client,
            group.id_grupo_transacciones,
            shift,
            currencies[currency],
            primaryDirection,
            primaryTotals[currency],
          );
        }
        if (changeTotals[currency] > 0) {
          await this.persistCashMovement(
            client,
            group.id_grupo_transacciones,
            shift,
            currencies[currency],
            'SALE',
            changeTotals[currency],
          );
        }
        }

        await this.applySettlementToCurrentCashCount(
          client,
          shift.id_turno,
          primaryDirection,
          input.settlement.primaryCounts,
          input.settlement.changeCounts,
        );
      }

      await this.refreshShiftAccountBalances(client, shift.id_turno);

      await client.query(
        `update temo.grupos_transacciones
         set estado = 'COMPLETADO',
             id_usuario_modificacion = $2
         where id_grupo_transacciones = $1`,
        [group.id_grupo_transacciones, userId],
      );

      await client.query(
        `insert into temo.bitacora (
           id_usuario,
           accion,
           tabla,
           id_registro,
           datos_nuevos,
           direccion_ip,
           agente_usuario
         )
         values ($1, 'CREAR', 'grupos_transacciones', $2, $3::jsonb, $4, $5)`,
        [
          userId,
          group.id_grupo_transacciones,
          JSON.stringify({
            codigoOperacion: group.codigo_operacion,
            cantidadTransacciones: persisted.length,
            idsTransacciones: persisted.map((item) => item.id),
            montoContado: primaryTotals,
            montoVuelto: changeTotals,
          }),
          this.normalizeIp(audit.ip),
          audit.userAgent ?? null,
        ],
      );

      return {
        groupId: group.id_grupo_transacciones,
        operationCode: Number(group.codigo_operacion),
        createdAt: new Date().toISOString(),
        transactions: persisted,
        settlement: {
          primaryDirection,
          primaryTotals,
          changeTotals,
        },
      };
    });
  }

  async listPending(user: AuthenticatedUser) {
    const result = await this.db.query(
      `select
         pp.id_pendiente as database_id,
         concat('PEN-', lpad(pp.codigo_pendiente::text, 6, '0')) as id,
         t.id_transaccion as transaction_database_id,
         t.id_turno as shift_database_id,
         concat(
           'TRA-',
           lpad(g.codigo_operacion::text, 6, '0'),
           '-',
           lpad(t.orden_grupo::text, 2, '0')
         ) as transaction_id,
         pp.tipo,
         pp.estado,
         pp.monto_original,
         pp.saldo_pendiente,
         pp.fecha_creacion,
         pp.fecha_modificacion,
         cp.nombre as contraparte,
         m.codigo as moneda,
         eb.codigo as entidad,
         cm.codigo_operativo as codigo_movimiento,
         cm.nombre_operativo as movimiento,
         u.nombre_completo as cajero,
         s.nombre as sucursal,
         tu.estado as estado_turno
       from temo.pagos_pendientes pp
       join temo.transacciones t on t.id_transaccion = pp.id_transaccion
       join temo.grupos_transacciones g
         on g.id_grupo_transacciones = t.id_grupo_transacciones
       join temo.turnos tu on tu.id_turno = t.id_turno
       join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
       join temo.monedas m on m.id_moneda = pp.id_moneda
       join temo.cuentas_movimientos cm
         on cm.id_cuenta_movimiento = t.id_cuenta_movimiento
       join temo.cuentas_bancarias cb on cb.id_cuenta = cm.id_cuenta
       join temo.entidades_bancarias eb on eb.id_entidad = cb.id_entidad
       join temo.usuarios u on u.id_usuario = t.id_cajero
       join temo.sucursales s on s.id_sucursal = t.id_sucursal
       where t.estado <> 'ANULADA'
         and (
           $1 = 'JEFA'
           or (
             t.id_cajero = $2::uuid
             and tu.estado in ('ABIERTO', 'PENDIENTE_APROBACION')
           )
         )
       order by
         case pp.estado
           when 'PENDIENTE' then 0
           when 'ABONADO' then 1
           when 'VENCIDO' then 2
           else 3
         end,
         pp.fecha_creacion desc`,
      [user.roleCode, user.id],
    );
    return result.rows;
  }

  detail(transactionId: string, user: AuthenticatedUser) {
    return this.db.transaction(async (client) => {
      const result = await client.query<{
        database_id: string;
        id: string;
        id_grupo_transacciones: string;
        codigo_operacion: string;
        orden_grupo: number;
        fecha_transaccion: string;
        monto: string;
        moneda: CurrencyCode;
        direccion: MoneyDirection;
        estado: string;
        entidad: string;
        codigo_movimiento: string;
        movimiento: string;
        cajero: string;
        sucursal: string;
        pendiente: string | null;
        pending_database_id: string | null;
        pending_type: 'POR_COBRAR' | 'POR_PAGAR' | null;
        pending_status: string | null;
        pending_balance: string | null;
        descripcion: string;
        id_cajero: string;
        id_contraparte: string;
        estado_turno: string;
        tasa_compra_usada: string;
        tasa_venta_usada: string;
      } & QueryResultRow>(
        `select
           t.id_transaccion as database_id,
           concat('TRA-', lpad(g.codigo_operacion::text, 6, '0'), '-', lpad(t.orden_grupo::text, 2, '0')) as id,
           t.id_grupo_transacciones,
           g.codigo_operacion,
           t.orden_grupo,
           t.fecha_transaccion,
           coalesce(tm.monto, t.monto_original) as monto,
           coalesce(mm.codigo, m.codigo) as moneda,
           coalesce(tm.direccion, ef.direccion_efectivo, 'ENTRA') as direccion,
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
           t.id_cajero,
           tu.estado as estado_turno,
           coalesce(t.tasa_compra_usada, 36.40) as tasa_compra_usada,
           coalesce(t.tasa_venta_usada, 37.00) as tasa_venta_usada
         from temo.transacciones t
         join temo.grupos_transacciones g on g.id_grupo_transacciones = t.id_grupo_transacciones
         join temo.turnos tu on tu.id_turno = t.id_turno
         join temo.monedas m on m.id_moneda = t.id_moneda_original
         join temo.cuentas_movimientos cm on cm.id_cuenta_movimiento = t.id_cuenta_movimiento
         join temo.cuentas_bancarias cb on cb.id_cuenta = cm.id_cuenta
         join temo.entidades_bancarias e on e.id_entidad = cb.id_entidad
         join temo.usuarios u on u.id_usuario = t.id_cajero
         join temo.sucursales s on s.id_sucursal = t.id_sucursal
         left join temo.efectos_movimientos ef on ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
         left join lateral (
           select tm_inner.direccion, tm_inner.monto, tm_inner.id_moneda
           from temo.transacciones_montos tm_inner
           where tm_inner.id_transaccion = t.id_transaccion
           order by tm_inner.fecha_creacion desc limit 1
         ) tm on true
         left join temo.monedas mm on mm.id_moneda = tm.id_moneda
         left join temo.pagos_pendientes pp
           on pp.id_transaccion = t.id_transaccion
          and pp.estado in ('PENDIENTE', 'ABONADO', 'VENCIDO')
         left join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
         where t.id_transaccion = $1`,
        [transactionId],
      );
      const transaction = result.rows[0];
      if (!transaction) {
        throw new NotFoundException('La transaccion seleccionada no existe.');
      }
      if (
        user.roleCode !== 'JEFA' &&
        (transaction.id_cajero !== user.id ||
          !['ABIERTO', 'PENDIENTE_APROBACION'].includes(transaction.estado_turno))
      ) {
        throw new ForbiddenException('No tiene permiso para consultar esta transaccion.');
      }

      // Recupera primero el arqueo propio de la transaccion y conserva compatibilidad con grupos antiguos.
      const cashRows = await client.query<{
        tipo: string;
        moneda: CurrencyCode;
        monto_esperado: string;
        tipo_tasa: RateKind | null;
        tasa_usada: string | null;
        denomination: string | null;
        piles25: number | null;
        loose: number | null;
      } & QueryResultRow>(
        `select
           a.tipo,
           m.codigo as moneda,
           a.monto_esperado,
           a.tipo_tasa,
           a.tasa_usada,
           d.valor as denomination,
           ad.montones_25 as piles25,
           ad.sueltos as loose
         from temo.arqueos a
         join temo.monedas m on m.id_moneda = a.id_moneda
         left join temo.arqueos_denominaciones ad on ad.id_arqueo = a.id_arqueo
         left join temo.denominaciones d on d.id_denominacion = ad.id_denominacion
         where (
             a.id_transaccion = $1
             or (a.id_transaccion is null and a.id_grupo_transacciones = $2)
           )
           and a.tipo in ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')
         order by a.tipo, m.codigo, d.valor desc nulls last`,
        [transaction.database_id, transaction.id_grupo_transacciones],
      );

      const emptyCounts = (): CashCounts => ({ NIO: [], USD: [] });
      const primaryCounts = emptyCounts();
      const changeCounts = emptyCounts();
      const expectedChange = { NIO: 0, USD: 0 };
      let primaryRateKind: RateKind = this.transactionRateKind(transaction.direccion, transaction.moneda);
      let changeRateKind: RateKind = primaryRateKind === 'COMPRA' ? 'VENTA' : 'COMPRA';

      for (const row of cashRows.rows) {
        const isChange = row.tipo === 'TRANSACCION_VUELTO';
        if (row.tipo_tasa) {
          if (isChange) changeRateKind = row.tipo_tasa;
          else primaryRateKind = row.tipo_tasa;
        }
        if (isChange) {
          expectedChange[row.moneda] = Number(row.monto_esperado || 0);
        }
        if (row.denomination !== null) {
          (isChange ? changeCounts : primaryCounts)[row.moneda].push({
            denomination: Number(row.denomination),
            piles25: Number(row.piles25 || 0),
            loose: Number(row.loose || 0),
          });
        }
      }

      const { id_cajero: _cashierId, estado_turno: _shiftState, ...visibleTransaction } = transaction;
      return {
        transaction: visibleTransaction,
        rates: {
          buy: Number(transaction.tasa_compra_usada),
          sell: Number(transaction.tasa_venta_usada),
        },
        settlement: {
          primaryRateKind,
          changeRateKind,
          expectedChange,
          primaryCounts,
          changeCounts,
        },
      };
    });
  }

  update(
    transactionId: string,
    input: UpdateTransactionInput,
    user: AuthenticatedUser,
  ) {
    return this.db.transaction(async (client) => {
      const transaction = await this.loadEditableTransaction(
        client,
        transactionId,
        user,
      );
      const previousSettlement = await this.loadStoredSettlement(
        client,
        transaction.id_grupo_transacciones,
        transaction.id_transaccion,
      );
      const rateId = await this.resolveExchangeRate(client, input, user.id);
      const movement = await this.resolveMovement(
        client,
        transaction.id_sucursal,
        input.entityCode,
        input.currencyCode,
        input.movementCode,
      );
      if (!movement.direccion_efectivo) {
        throw new ConflictException(
          `El movimiento ${input.movementCode} no tiene direccion de efectivo configurada.`,
        );
      }

      if (transaction.estado_pendiente === 'PAGADO') {
        throw new ConflictException(
          'Una transaccion con el pendiente pagado no puede modificar sus datos financieros.',
        );
      }

      const methods = await this.loadPaymentMethods(client);
      const counterpartId = input.pendingName
        ? await this.resolveCounterpart(client, input.pendingName)
        : null;
      const methodId = input.pendingName ? methods.CREDITO : methods.EFECTIVO;

      await client.query(
        `update temo.transacciones
         set id_cuenta_movimiento = $2,
             id_contraparte = $3,
             id_metodo_pago = $4,
             id_moneda_original = $5,
             monto_original = $6,
             id_tipo_cambio = $7,
             tasa_compra_usada = $8,
             tasa_venta_usada = $9,
             descripcion = nullif($10, ''),
             id_usuario_modificacion = $11,
             fecha_modificacion = now()
         where id_transaccion = $1`,
        [
          transactionId,
          movement.id_cuenta_movimiento,
          counterpartId,
          methodId,
          movement.id_moneda,
          input.amount,
          rateId,
          input.rates.buy,
          input.rates.sell,
          input.description,
          user.id,
        ],
      );

      await client.query(
        `delete from temo.transacciones_montos where id_transaccion = $1`,
        [transactionId],
      );
      await client.query(
        `insert into temo.transacciones_montos (
           id_transaccion, direccion, medio, id_moneda, monto, observaciones
         ) values ($1, $2, $3, $4, $5, $6)`,
        [
          transactionId,
          movement.direccion_efectivo,
          input.pendingName ? 'CREDITO' : 'EFECTIVO',
          movement.id_moneda,
          input.amount,
          input.pendingName ? `Pendiente: ${input.pendingName}` : null,
        ],
      );

      await client.query(
        `delete from temo.movimientos_cuentas
         where id_transaccion = $1 and es_reverso = false`,
        [transactionId],
      );
      if (movement.afecta_cuenta && movement.direccion_cuenta) {
        await client.query(
          `insert into temo.movimientos_cuentas (
             id_transaccion, id_cuenta, id_moneda, direccion, monto
           ) values ($1, $2, $3, $4, $5)`,
          [
            transactionId,
            movement.id_cuenta,
            movement.id_moneda,
            movement.direccion_cuenta,
            input.amount,
          ],
        );
      }

      if (input.pendingName && counterpartId) {
        const pendingType =
          movement.tipo_pendiente ??
          (movement.direccion_efectivo === 'ENTRA'
            ? 'POR_COBRAR'
            : 'POR_PAGAR');
        const pendingResult = await client.query<{ id_pendiente: string } & QueryResultRow>(
          `insert into temo.pagos_pendientes (
             id_transaccion, tipo, id_contraparte, id_moneda,
             monto_original, saldo_pendiente, observaciones,
             id_usuario_creacion
           ) values ($1, $2, $3, $4, $5, $5, $6, $7)
           on conflict (id_transaccion) do update
           set tipo = excluded.tipo,
               id_contraparte = excluded.id_contraparte,
               id_moneda = excluded.id_moneda,
               monto_original = excluded.monto_original,
               saldo_pendiente = excluded.monto_original,
               estado = 'PENDIENTE',
               observaciones = excluded.observaciones,
               fecha_modificacion = now()
           returning id_pendiente`,
          [
            transactionId,
            pendingType,
            counterpartId,
            movement.id_moneda,
            input.amount,
            input.description || null,
            user.id,
          ],
        );
        if (!transaction.id_pendiente || transaction.estado_pendiente !== 'PENDIENTE') {
          await client.query(
            `insert into temo.historial_pendientes (
               id_pendiente, estado_anterior, estado_nuevo, id_usuario, motivo
             ) values ($1, $2::temo.estado_pendiente, 'PENDIENTE', $3, $4)`,
            [
              pendingResult.rows[0].id_pendiente,
              transaction.estado_pendiente,
              user.id,
              transaction.id_pendiente
                ? 'Pendiente reactivado al editar la transaccion'
                : 'Pendiente creado al editar la transaccion',
            ],
          );
        }
      } else if (
        transaction.id_pendiente &&
        transaction.estado_pendiente !== 'CANCELADO'
      ) {
        await client.query(
          `update temo.pagos_pendientes
           set estado = 'CANCELADO',
               saldo_pendiente = 0,
               fecha_modificacion = now()
           where id_pendiente = $1`,
          [transaction.id_pendiente],
        );
        await client.query(
          `insert into temo.historial_pendientes (
             id_pendiente, estado_anterior, estado_nuevo, id_usuario, motivo
           ) values ($1, $2::temo.estado_pendiente, 'CANCELADO', $3, 'Pendiente retirado al editar la transaccion')`,
          [transaction.id_pendiente, transaction.estado_pendiente, user.id],
        );
      }

      await client.query(
        `delete from temo.transacciones_comisiones where id_transaccion = $1`,
        [transactionId],
      );
      await this.persistCommission(client, transactionId, movement, input.amount);
      await this.replaceGroupSettlement(
        client,
        transaction,
        input,
        previousSettlement,
        rateId,
        user.id,
        movement.direccion_efectivo,
      );
      await this.refreshShiftAccountBalances(client, transaction.id_turno);

      await client.query(
        `insert into temo.bitacora (
           id_usuario, accion, tabla, id_registro, datos_nuevos
         ) values ($1, 'ACTUALIZAR', 'transacciones', $2, $3::jsonb)`,
        [user.id, transactionId, JSON.stringify(input)],
      );

      return { id: transactionId, updated: true };
    });
  }

  payPending(
    pendingId: string,
    input: PayPendingInput,
    user: AuthenticatedUser,
  ) {
    return this.db.transaction(async (client) => {
      const result = await client.query<{
        id_pendiente: string;
        estado: string;
        id_transaccion: string;
        id_turno: string;
        id_cajero: string;
        tipo: 'POR_COBRAR' | 'POR_PAGAR';
        id_moneda: string;
        moneda: CurrencyCode;
        saldo_pendiente: string;
        contraparte: string;
      } & QueryResultRow>(
        `select
           pp.id_pendiente,
           pp.estado,
           pp.id_transaccion,
           t.id_turno,
           t.id_cajero,
           pp.tipo,
           pp.id_moneda,
           m.codigo as moneda,
           pp.saldo_pendiente,
           cp.nombre as contraparte
         from temo.pagos_pendientes pp
         join temo.transacciones t on t.id_transaccion = pp.id_transaccion
         join temo.monedas m on m.id_moneda = pp.id_moneda
         join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
         where pp.id_pendiente = $1
         for update of pp`,
        [pendingId],
      );
      const pending = result.rows[0];
      if (!pending) {
        throw new NotFoundException('El pendiente seleccionado no existe.');
      }
      if (user.roleCode !== 'JEFA' && pending.id_cajero !== user.id) {
        throw new ForbiddenException(
          'No tiene permiso para pagar este pendiente.',
        );
      }
      if (pending.estado === 'PAGADO') {
        throw new ConflictException('Este pendiente ya fue pagado.');
      }
      if (pending.estado === 'CANCELADO') {
        throw new ConflictException('Un pendiente cancelado no puede marcarse como pagado.');
      }

      const shiftResult = await client.query<ShiftRow>(
        `select id_turno, id_sucursal, id_caja, id_cajero
         from temo.turnos
         where id_turno = $1
           and id_cajero = $2
           and estado in ('ABIERTO', 'PENDIENTE_APROBACION')
         for update`,
        [pending.id_turno, pending.id_cajero],
      );
      const activeShift = shiftResult.rows[0] ?? null;
      if (user.roleCode !== 'JEFA' && !activeShift) {
        throw new ConflictException(
          'El turno donde se registro el pendiente ya no esta activo.',
        );
      }

      const rateId = await this.resolveExchangeRate(client, input, user.id);
      const amount = Number(pending.saldo_pendiente);
      const primaryDirection: MoneyDirection =
        pending.tipo === 'POR_COBRAR' ? 'ENTRA' : 'SALE';
      const primaryTotals = this.cashTotals(input.settlement.primaryCounts);
      const changeTotals = this.cashTotals(input.settlement.changeCounts);
      if (primaryTotals.NIO <= 0 && primaryTotals.USD <= 0) {
        throw new ConflictException(
          'Debe completar el conteo fisico antes de marcar el pendiente como pagado.',
        );
      }
      if (
        pending.tipo === 'POR_PAGAR' &&
        (changeTotals.NIO > 0 || changeTotals.USD > 0)
      ) {
        throw new ConflictException(
          'Una cuenta por pagar no puede registrar vuelto.',
        );
      }

      const abonoResult = await client.query<{
        id_abono: string;
      } & QueryResultRow>(
        `insert into temo.abonos_pendientes (
           id_pendiente,
           id_transaccion,
           id_turno_aplicacion,
           id_moneda,
           monto,
           id_tipo_cambio,
           tasa_compra_usada,
           tasa_venta_usada,
           id_usuario_creacion,
           observaciones
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id_abono`,
        [
          pendingId,
          pending.id_transaccion,
          activeShift?.id_turno ?? null,
          pending.id_moneda,
          amount,
          rateId,
          input.rates.buy,
          input.rates.sell,
          user.id,
          activeShift
            ? 'Pago aplicado al arqueo del turno de origen.'
            : 'Pago registrado por Jefa sin afectar otro turno del cajero.',
        ],
      );
      const paymentId = abonoResult.rows[0].id_abono;
      const currencies = await this.loadCurrencies(client);
      const denominations = await this.loadDenominations(client);
      const primaryType = primaryDirection === 'ENTRA'
        ? 'PENDIENTE_RECIBIDO'
        : 'PENDIENTE_ENTREGADO';

      for (const currency of ['NIO', 'USD'] as const) {
        const expectedAmount = currency === pending.moneda ? amount : 0;
        if (primaryTotals[currency] > 0 || expectedAmount > 0) {
          await this.persistPendingCashCount(client, {
            paymentId,
            userId: user.id,
            rateId,
            rateKind: input.settlement.primaryRateKind,
            rateValue: this.rateValue(input, input.settlement.primaryRateKind),
            currency,
            currencyId: currencies[currency],
            type: primaryType,
            expectedAmount,
            lines: input.settlement.primaryCounts[currency],
            denominations,
          });
        }
        if (
          changeTotals[currency] > 0 ||
          input.settlement.expectedChange[currency] > 0
        ) {
          await this.persistPendingCashCount(client, {
            paymentId,
            userId: user.id,
            rateId,
            rateKind: input.settlement.changeRateKind,
            rateValue: this.rateValue(input, input.settlement.changeRateKind),
            currency,
            currencyId: currencies[currency],
            type: 'PENDIENTE_VUELTO',
            expectedAmount: input.settlement.expectedChange[currency],
            lines: input.settlement.changeCounts[currency],
            denominations,
          });
        }

        if (activeShift && primaryTotals[currency] > 0) {
          await this.persistPendingCashMovement(
            client,
            paymentId,
            activeShift,
            currencies[currency],
            primaryDirection,
            primaryTotals[currency],
          );
        }
        if (activeShift && changeTotals[currency] > 0) {
          await this.persistPendingCashMovement(
            client,
            paymentId,
            activeShift,
            currencies[currency],
            'SALE',
            changeTotals[currency],
          );
        }
      }

      if (activeShift) {
        await this.applySettlementToCurrentCashCount(
          client,
          activeShift.id_turno,
          primaryDirection,
          input.settlement.primaryCounts,
          input.settlement.changeCounts,
        );
      }

      await client.query(
        `update temo.pagos_pendientes
         set estado = 'PAGADO',
             saldo_pendiente = 0,
             fecha_modificacion = now()
         where id_pendiente = $1`,
        [pendingId],
      );
      await client.query(
        `insert into temo.historial_pendientes (
           id_pendiente, estado_anterior, estado_nuevo, id_usuario, motivo
         ) values ($1, $2, 'PAGADO', $3, 'Marcado como pagado desde la pantalla Pendientes')`,
        [pendingId, pending.estado, user.id],
      );
      if (user.roleCode === 'JEFA' && activeShift) {
        await client.query(
          `insert into temo.notificaciones_usuarios (
             id_usuario_destino,
             tipo,
             titulo,
             mensaje,
             id_pendiente,
             id_turno,
             id_usuario_origen
           ) values ($1, 'PENDIENTE_PAGADO', $2, $3, $4, $5, $6)`,
          [
            pending.id_cajero,
            'Pendiente marcado como pagado',
            `La Jefa registró el pago pendiente de ${pending.contraparte}.`,
            pendingId,
            activeShift.id_turno,
            user.id,
          ],
        );
      }
      await client.query(
        `insert into temo.bitacora (
           id_usuario, accion, tabla, id_registro, datos_anteriores, datos_nuevos
         ) values (
           $1, 'ACTUALIZAR', 'pagos_pendientes', $2,
           $3::jsonb,
           $4::jsonb
         )`,
        [
          user.id,
          pendingId,
          JSON.stringify({ estado: pending.estado }),
          JSON.stringify({
            estado: 'PAGADO',
            saldo_pendiente: 0,
            id_abono: paymentId,
            id_turno_aplicacion: activeShift?.id_turno ?? null,
          }),
        ],
      );
      return {
        id: pendingId,
        paymentId,
        estado: 'PAGADO',
        appliedShiftId: activeShift?.id_turno ?? null,
        cashierNotified: user.roleCode === 'JEFA' && Boolean(activeShift),
      };
    });
  }

  payPendingBatch(input: PayPendingBatchInput, user: AuthenticatedUser) {
    return this.db.transaction(async (client) => {
      // Bloquea todos los pendientes para liquidarlos como una sola operacion atomica.
      const result = await client.query<{
        id_pendiente: string;
        estado: string;
        id_transaccion: string;
        id_turno: string;
        id_sucursal: string;
        id_caja: string;
        id_cajero: string;
        tipo: 'POR_COBRAR' | 'POR_PAGAR';
        id_moneda: string;
        moneda: CurrencyCode;
        saldo_pendiente: string;
        contraparte: string;
      } & QueryResultRow>(
        `select pp.id_pendiente, pp.estado, pp.id_transaccion,
           t.id_turno, t.id_sucursal, t.id_caja, t.id_cajero,
           pp.tipo, pp.id_moneda, pp.id_contraparte, m.codigo as moneda,
           pp.saldo_pendiente, cp.nombre as contraparte
         from temo.pagos_pendientes pp
         join temo.transacciones t on t.id_transaccion = pp.id_transaccion
         join temo.monedas m on m.id_moneda = pp.id_moneda
         join temo.contrapartes cp on cp.id_contraparte = pp.id_contraparte
         where pp.id_pendiente = any($1::uuid[])
         order by pp.fecha_creacion
         for update of pp`,
        [input.pendingIds],
      );
      if (result.rowCount !== input.pendingIds.length) {
        throw new NotFoundException('Uno o mas pendientes seleccionados no existen.');
      }
      const pendings = result.rows;
      const reference = pendings[0];
      if (pendings.some((pending) => pending.estado !== 'PENDIENTE' && pending.estado !== 'ABONADO' && pending.estado !== 'VENCIDO')) {
        throw new ConflictException('Todos los pendientes seleccionados deben estar disponibles para pago.');
      }
      if (pendings.some((pending) => pending.tipo !== reference.tipo || pending.moneda !== reference.moneda || pending.id_turno !== reference.id_turno)) {
        throw new ConflictException('Seleccione pendientes del mismo tipo, moneda y turno.');
      }
      if (user.roleCode !== 'JEFA' && pendings.some((pending) => pending.id_cajero !== user.id)) {
        throw new ForbiddenException('No tiene permiso para pagar uno o mas pendientes seleccionados.');
      }

      const shiftResult = await client.query<ShiftRow>(
        `select id_turno, id_sucursal, id_caja, id_cajero
         from temo.turnos
         where id_turno = $1 and estado in ('ABIERTO', 'PENDIENTE_APROBACION')
         for update`,
        [reference.id_turno],
      );
      const activeShift = shiftResult.rows[0];
      if (!activeShift) {
        throw new ConflictException('El turno de los pendientes seleccionados ya no esta activo.');
      }

      const totalAmount = pendings.reduce((sum, pending) => sum + Number(pending.saldo_pendiente), 0);
      const primaryDirection: MoneyDirection = reference.tipo === 'POR_COBRAR' ? 'ENTRA' : 'SALE';
      const rateId = await this.resolveExchangeRate(client, input, user.id);
      const digitalTotal = input.method === 'DIGITAL' ? totalAmount : input.method === 'MIXTO' ? Number(input.digital!.amount) : 0;
      const cashTotal = totalAmount - digitalTotal;
      if (digitalTotal < 0 || digitalTotal > totalAmount || (input.method === 'MIXTO' && (digitalTotal <= 0 || cashTotal <= 0))) {
        throw new ConflictException('El monto digital debe ser menor que el total para conservar una parte en efectivo.');
      }
      const cashPayments: Array<{ id: string; pendingId: string; amount: number }> = [];
      const digitalPayments: Array<{ id: string; pendingId: string; counterpartId: string; amount: number }> = [];
      let remainingDigital = digitalTotal;

      // Divide cada pendiente entre sus porciones digital y efectiva sin perder trazabilidad.
      for (const pending of pendings) {
        const pendingAmount = Number(pending.saldo_pendiente);
        const digitalAmount = Math.min(pendingAmount, remainingDigital);
        const cashAmount = pendingAmount - digitalAmount;
        remainingDigital -= digitalAmount;
        for (const portion of [
          { kind: 'digital', amount: digitalAmount },
          { kind: 'efectivo', amount: cashAmount },
        ]) {
          if (portion.amount <= 0) continue;
          const payment = await client.query<{ id_abono: string } & QueryResultRow>(
            `insert into temo.abonos_pendientes (
               id_pendiente, id_transaccion, id_turno_aplicacion, id_moneda,
               monto, id_tipo_cambio, tasa_compra_usada, tasa_venta_usada,
               id_usuario_creacion, observaciones
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             returning id_abono`,
            [pending.id_pendiente, pending.id_transaccion, activeShift.id_turno,
              pending.id_moneda, portion.amount, rateId,
              input.rates.buy, input.rates.sell, user.id,
              `Liquidacion ${portion.kind} de operacion ${input.method.toLowerCase()}.`],
          );
          const allocation = { id: payment.rows[0].id_abono, pendingId: pending.id_pendiente, amount: portion.amount };
          if (portion.kind === 'digital') {
            digitalPayments.push({ ...allocation, counterpartId: pending.id_contraparte });
          } else {
            cashPayments.push(allocation);
          }
        }
      }

      if (cashTotal > 0) {
        const settlement = input.settlement!;
        const primaryTotals = this.cashTotals(settlement.primaryCounts);
        const changeTotals = this.cashTotals(settlement.changeCounts);
        if (primaryTotals.NIO <= 0 && primaryTotals.USD <= 0) {
          throw new ConflictException('Debe completar el conteo fisico de la liquidacion.');
        }
        if (reference.tipo === 'POR_PAGAR' && (changeTotals.NIO > 0 || changeTotals.USD > 0)) {
          throw new ConflictException('Una cuenta por pagar no puede registrar vuelto.');
        }
        const currencies = await this.loadCurrencies(client);
        const denominations = await this.loadDenominations(client);
        const primaryType = primaryDirection === 'ENTRA' ? 'PENDIENTE_RECIBIDO' : 'PENDIENTE_ENTREGADO';

        // El primer abono efectivo identifica el arqueo compartido del lote completo.
        for (const currency of ['NIO', 'USD'] as const) {
          const expectedAmount = currency === reference.moneda ? cashTotal : 0;
          if (primaryTotals[currency] > 0 || expectedAmount > 0) {
            await this.persistPendingCashCount(client, {
              paymentId: cashPayments[0].id, userId: user.id, rateId,
              rateKind: settlement.primaryRateKind,
              rateValue: this.rateValue(input, settlement.primaryRateKind),
              currency, currencyId: currencies[currency], type: primaryType,
              expectedAmount, lines: settlement.primaryCounts[currency], denominations,
            });
          }
          if (changeTotals[currency] > 0 || settlement.expectedChange[currency] > 0) {
            await this.persistPendingCashCount(client, {
              paymentId: cashPayments[0].id, userId: user.id, rateId,
              rateKind: settlement.changeRateKind,
              rateValue: this.rateValue(input, settlement.changeRateKind),
              currency, currencyId: currencies[currency], type: 'PENDIENTE_VUELTO',
              expectedAmount: settlement.expectedChange[currency],
              lines: settlement.changeCounts[currency], denominations,
            });
          }
          if (primaryTotals[currency] > 0) {
            await this.persistPendingCashMovement(client, cashPayments[0].id, activeShift, currencies[currency], primaryDirection, primaryTotals[currency]);
          }
          if (changeTotals[currency] > 0) {
            await this.persistPendingCashMovement(client, cashPayments[0].id, activeShift, currencies[currency], 'SALE', changeTotals[currency]);
          }
        }
        await this.applySettlementToCurrentCashCount(client, activeShift.id_turno, primaryDirection, settlement.primaryCounts, settlement.changeCounts);
      }

      if (digitalTotal > 0) {
        // La porcion digital usa exclusivamente un movimiento bancario configurado para la sucursal.
        const movement = await this.resolveMovement(
          client, activeShift.id_sucursal, input.digital!.entityCode,
          reference.moneda, input.digital!.movementCode,
        );
        if (!movement.afecta_cuenta || movement.direccion_cuenta !== primaryDirection) {
          throw new ConflictException(`El movimiento digital debe ser de ${primaryDirection === 'ENTRA' ? 'ingreso' : 'egreso'} bancario.`);
        }
        const methodResult = await client.query<{ id_metodo_pago: string } & QueryResultRow>(
          `select id_metodo_pago from temo.metodos_pago
           where codigo = 'TRANSFERENCIA' and estado = 'ACTIVO' limit 1`,
        );
        if (!methodResult.rows[0]) {
          throw new ConflictException('El metodo de pago TRANSFERENCIA no esta configurado.');
        }
        const groupResult = await client.query<{ id_grupo_transacciones: string } & QueryResultRow>(
          `insert into temo.grupos_transacciones (
             id_turno,id_contraparte,estado,observaciones,id_usuario_creacion
           ) values ($1,$2,'COMPLETADO',$3,$4)
           returning id_grupo_transacciones`,
          [activeShift.id_turno, reference.id_contraparte, 'Liquidacion digital de pendientes.', user.id],
        );
        const consecutiveResult = await client.query<{ next_value: number } & QueryResultRow>(
          `select coalesce(max(consecutivo_turno),0) + 1 as next_value
           from temo.transacciones where id_turno = $1`,
          [activeShift.id_turno],
        );
        const firstConsecutive = Number(consecutiveResult.rows[0].next_value);

        // Cada porcion digital genera una transaccion bancaria visible y vinculada con su abono.
        for (const [index, payment] of digitalPayments.entries()) {
          const transactionResult = await client.query<{ id_transaccion: string } & QueryResultRow>(
            `insert into temo.transacciones (
               id_turno,id_sucursal,id_caja,id_cajero,id_grupo_transacciones,orden_grupo,
               id_cuenta_movimiento,id_contraparte,id_metodo_pago,id_moneda_original,
               monto_original,id_tipo_cambio,tasa_compra_usada,tasa_venta_usada,
               descripcion,consecutivo_turno,id_usuario_creacion
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             returning id_transaccion`,
            [activeShift.id_turno, activeShift.id_sucursal, activeShift.id_caja,
              activeShift.id_cajero, groupResult.rows[0].id_grupo_transacciones, index + 1,
              movement.id_cuenta_movimiento, payment.counterpartId,
              methodResult.rows[0].id_metodo_pago, movement.id_moneda, payment.amount, rateId,
              input.rates.buy, input.rates.sell,
              `Liquidacion digital del pendiente ${payment.pendingId}.`,
              firstConsecutive + index, user.id],
          );
          const paymentTransactionId = transactionResult.rows[0].id_transaccion;
          await client.query(
            `insert into temo.movimientos_cuentas (id_transaccion,id_cuenta,id_moneda,direccion,monto)
             values ($1,$2,$3,$4,$5)`,
            [paymentTransactionId, movement.id_cuenta, movement.id_moneda, primaryDirection, payment.amount],
          );
          await client.query(
            `insert into temo.transacciones_montos (id_transaccion,direccion,medio,id_moneda,monto,id_cuenta,observaciones)
             values ($1,$2,'CUENTA_BANCARIA',$3,$4,$5,'Liquidacion digital de pendiente')`,
            [paymentTransactionId, primaryDirection, movement.id_moneda, payment.amount, movement.id_cuenta],
          );
          await client.query(
            `update temo.abonos_pendientes set id_transaccion = $2 where id_abono = $1`,
            [payment.id, paymentTransactionId],
          );
        }
        await this.refreshShiftAccountBalances(client, activeShift.id_turno);
      }

      // Finaliza todos los pendientes y registra historial y auditoria del lote.
      await client.query(
        `update temo.pagos_pendientes set estado='PAGADO', saldo_pendiente=0, fecha_modificacion=now()
         where id_pendiente = any($1::uuid[])`,
        [input.pendingIds],
      );
      for (const pending of pendings) {
        await client.query(
          `insert into temo.historial_pendientes (id_pendiente,estado_anterior,estado_nuevo,id_usuario,motivo)
           values ($1,$2::temo.estado_pendiente,'PAGADO',$3,$4)`,
          [pending.id_pendiente, pending.estado, user.id, `Liquidacion multiple en ${input.method.toLowerCase()}`],
        );
      }
      await client.query(
        `insert into temo.bitacora (id_usuario,accion,tabla,id_registro,datos_nuevos)
         values ($1,'ACTUALIZAR','pagos_pendientes',$2,$3::jsonb)`,
        [user.id, reference.id_pendiente, JSON.stringify({ pendingIds: input.pendingIds, method: input.method, totalAmount })],
      );
      return { ids: input.pendingIds, estado: 'PAGADO', method: input.method, totalAmount };
    });
  }

  private async loadEditableTransaction(
    client: PoolClient,
    transactionId: string,
    user: AuthenticatedUser,
  ) {
    const result = await client.query<EditableTransactionRow>(
      `select
         t.id_transaccion,
         t.id_grupo_transacciones,
         t.id_turno,
         t.id_sucursal,
         t.id_caja,
         t.id_cajero,
         t.estado as estado_transaccion,
         tu.estado as estado_turno,
         pp.id_pendiente,
         pp.estado as estado_pendiente
       from temo.transacciones t
       join temo.turnos tu on tu.id_turno = t.id_turno
       left join temo.pagos_pendientes pp
         on pp.id_transaccion = t.id_transaccion
       where t.id_transaccion = $1
       for update of t`,
      [transactionId],
    );
    const transaction = result.rows[0];
    if (!transaction) {
      throw new NotFoundException('La transaccion seleccionada no existe.');
    }
    if (transaction.estado_transaccion === 'ANULADA') {
      throw new ConflictException('Una transaccion anulada no puede editarse.');
    }
    if (
      user.roleCode !== 'JEFA' &&
      (transaction.id_cajero !== user.id || transaction.estado_turno !== 'ABIERTO')
    ) {
      throw new ForbiddenException(
        'Solo puede editar transacciones de su turno abierto.',
      );
    }
    return transaction;
  }

  private async resolveShift(
    client: PoolClient,
    input: CreateTransactionBatchInput,
  ) {
    const result = await client.query<ShiftRow>(
      `select id_turno, id_sucursal, id_caja, id_cajero
       from temo.turnos
       where estado in ('ABIERTO', 'PENDIENTE_APROBACION')
         and ($1::uuid is null or id_turno = $1)
         and id_cajero = $2::uuid
       order by fecha_apertura desc
       limit 1
       for update`,
      [input.shiftId ?? null, input.userId ?? null],
    );
    if (!result.rows[0]) {
      throw new ConflictException(
        'No existe un turno abierto para registrar la transaccion. Abra un turno antes de guardar.',
      );
    }
    return result.rows[0];
  }

  private async loadStoredSettlement(
    client: PoolClient,
    groupId: string,
    transactionId: string,
  ): Promise<StoredSettlement> {
    const result = await client.query<{
      tipo: string;
      moneda: CurrencyCode;
      denomination: string | null;
      piles25: number | null;
      loose: number | null;
      independent: boolean;
    } & QueryResultRow>(
      `select
         a.tipo,
         m.codigo as moneda,
         d.valor as denomination,
         ad.montones_25 as piles25,
         ad.sueltos as loose
         ,(a.id_transaccion is not null) as independent
       from temo.arqueos a
       join temo.monedas m on m.id_moneda = a.id_moneda
       left join temo.arqueos_denominaciones ad on ad.id_arqueo = a.id_arqueo
       left join temo.denominaciones d on d.id_denominacion = ad.id_denominacion
       where (a.id_transaccion = $2 or (a.id_transaccion is null and a.id_grupo_transacciones = $1))
         and a.tipo in ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')`,
      [groupId, transactionId],
    );
    const primaryCounts: CashCounts = { NIO: [], USD: [] };
    const changeCounts: CashCounts = { NIO: [], USD: [] };
    let primaryDirection: MoneyDirection = 'ENTRA';
    for (const row of result.rows) {
      if (row.tipo === 'TRANSACCION_ENTREGADO') primaryDirection = 'SALE';
      if (row.tipo === 'TRANSACCION_RECIBIDO') primaryDirection = 'ENTRA';
      if (row.denomination === null) continue;
      const target = row.tipo === 'TRANSACCION_VUELTO' ? changeCounts : primaryCounts;
      target[row.moneda].push({
        denomination: Number(row.denomination),
        piles25: Number(row.piles25 || 0),
        loose: Number(row.loose || 0),
      });
    }
    return { independent: result.rows.some((row) => row.independent), primaryDirection, primaryCounts, changeCounts };
  }

  private async replaceGroupSettlement(
    client: PoolClient,
    transaction: EditableTransactionRow,
    input: UpdateTransactionInput,
    previous: StoredSettlement,
    rateId: string,
    userId: string,
    transactionDirection: MoneyDirection,
  ) {
    await client.query(
      `update temo.transacciones
       set id_tipo_cambio = $2,
           tasa_compra_usada = $3,
           tasa_venta_usada = $4,
           id_usuario_modificacion = $5,
           fecha_modificacion = now()
       where id_grupo_transacciones = $1`,
      [
        transaction.id_grupo_transacciones,
        rateId,
        input.rates.buy,
        input.rates.sell,
        userId,
      ],
    );

    if (previous.independent) {
      await this.replaceIndependentSettlement(
        client, transaction, input, previous, rateId, userId, transactionDirection,
      );
      return;
    }

    const groupTransactions = await client.query<{
      direccion: MoneyDirection;
      moneda: CurrencyCode;
      monto: string;
    } & QueryResultRow>(
      `select
         coalesce(tm.direccion, ef.direccion_efectivo) as direccion,
         coalesce(mm.codigo, mo.codigo) as moneda,
         coalesce(tm.monto, t.monto_original) as monto
       from temo.transacciones t
       join temo.monedas mo on mo.id_moneda = t.id_moneda_original
       join temo.cuentas_movimientos cm on cm.id_cuenta_movimiento = t.id_cuenta_movimiento
       left join temo.efectos_movimientos ef on ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
       left join lateral (
         select tm_inner.direccion, tm_inner.id_moneda, tm_inner.monto
         from temo.transacciones_montos tm_inner
         where tm_inner.id_transaccion = t.id_transaccion
         order by tm_inner.fecha_creacion desc limit 1
       ) tm on true
       left join temo.monedas mm on mm.id_moneda = tm.id_moneda
       where t.id_grupo_transacciones = $1 and t.estado <> 'ANULADA'`,
      [transaction.id_grupo_transacciones],
    );

    const expectedNet: Record<CurrencyCode, number> = { NIO: 0, USD: 0 };
    let expectedNetNio = 0;
    for (const row of groupTransactions.rows) {
      if (!row.direccion) {
        throw new ConflictException('Una transaccion del grupo no tiene direccion de efectivo configurada.');
      }
      const amount = Number(row.monto);
      const sign = row.direccion === 'ENTRA' ? 1 : -1;
      const rateKind = this.transactionRateKind(row.direccion, row.moneda);
      expectedNet[row.moneda] += sign * amount;
      expectedNetNio += sign * (row.moneda === 'USD' ? amount * this.rateValue(input, rateKind) : amount);
    }

    const currencies = await this.loadCurrencies(client);
    const denominations = await this.loadDenominations(client);
    const primaryDirection: MoneyDirection = expectedNetNio < 0 ? 'SALE' : 'ENTRA';
    const primaryType = primaryDirection === 'ENTRA'
      ? 'TRANSACCION_RECIBIDO'
      : 'TRANSACCION_ENTREGADO';
    const primaryTotals = this.cashTotals(input.settlement.primaryCounts);
    const changeTotals = this.cashTotals(input.settlement.changeCounts);
    // Mantiene la misma regla al editar una transaccion que genera un pendiente total.
    if (
      input.pendingName &&
      (primaryTotals.NIO > 0 || primaryTotals.USD > 0 || changeTotals.NIO > 0 || changeTotals.USD > 0)
    ) {
      throw new ConflictException(
        'Un pendiente total no puede guardarse con billetes ni vuelto. Limpie el arqueo e intente nuevamente.',
      );
    }
    const shift: ShiftRow = {
      id_turno: transaction.id_turno,
      id_sucursal: transaction.id_sucursal,
      id_caja: transaction.id_caja,
      id_cajero: transaction.id_cajero,
    };

    await client.query(
      `delete from temo.movimientos_efectivo
       where id_grupo_transacciones = $1 and es_reverso = false`,
      [transaction.id_grupo_transacciones],
    );
    await client.query(
      `delete from temo.arqueos
       where id_grupo_transacciones = $1
         and tipo in ('TRANSACCION_RECIBIDO', 'TRANSACCION_ENTREGADO', 'TRANSACCION_VUELTO')`,
      [transaction.id_grupo_transacciones],
    );

    for (const currency of ['NIO', 'USD'] as const) {
      if (primaryTotals[currency] > 0 || Math.abs(expectedNet[currency]) > 0) {
        await this.persistCashCount(client, {
          groupId: transaction.id_grupo_transacciones,
          shift,
          userId,
          rateId,
          rateKind: input.settlement.primaryRateKind,
          rateValue: this.rateValue(input, input.settlement.primaryRateKind),
          currency,
          currencyId: currencies[currency],
          type: primaryType,
          expectedAmount: Math.abs(expectedNet[currency]),
          lines: input.settlement.primaryCounts[currency],
          denominations,
        });
      }
      if (changeTotals[currency] > 0 || input.settlement.expectedChange[currency] > 0) {
        await this.persistCashCount(client, {
          groupId: transaction.id_grupo_transacciones,
          shift,
          userId,
          rateId,
          rateKind: input.settlement.changeRateKind,
          rateValue: this.rateValue(input, input.settlement.changeRateKind),
          currency,
          currencyId: currencies[currency],
          type: 'TRANSACCION_VUELTO',
          expectedAmount: input.settlement.expectedChange[currency],
          lines: input.settlement.changeCounts[currency],
          denominations,
        });
      }
      if (primaryTotals[currency] > 0) {
        await this.persistCashMovement(
          client,
          transaction.id_grupo_transacciones,
          shift,
          currencies[currency],
          primaryDirection,
          primaryTotals[currency],
        );
      }
      if (changeTotals[currency] > 0) {
        await this.persistCashMovement(
          client,
          transaction.id_grupo_transacciones,
          shift,
          currencies[currency],
          'SALE',
          changeTotals[currency],
        );
      }
    }

    await this.applySettlementDeltaToCurrentCashCount(
      client,
      transaction.id_turno,
      previous,
      {
        independent: false,
        primaryDirection,
        primaryCounts: input.settlement.primaryCounts,
        changeCounts: input.settlement.changeCounts,
      },
    );
    await client.query(
      `update temo.grupos_transacciones
       set id_tipo_cambio_vuelto = $2,
           tipo_tasa_vuelto = $3,
           tasa_vuelto_usada = $4,
           id_usuario_modificacion = $5
       where id_grupo_transacciones = $1`,
      [
        transaction.id_grupo_transacciones,
        rateId,
        input.settlement.changeRateKind,
        this.rateValue(input, input.settlement.changeRateKind),
        userId,
      ],
    );
  }

  // Reemplaza sólo el arqueo de la transaccion editada sin alterar otras pestañas.
  private async replaceIndependentSettlement(
    client: PoolClient,
    transaction: EditableTransactionRow,
    input: UpdateTransactionInput,
    previous: StoredSettlement,
    rateId: string,
    userId: string,
    direction: MoneyDirection,
  ) {
    const primaryTotals = this.cashTotals(input.settlement.primaryCounts);
    const changeTotals = this.cashTotals(input.settlement.changeCounts);
    if (input.pendingName && (primaryTotals.NIO > 0 || primaryTotals.USD > 0 || changeTotals.NIO > 0 || changeTotals.USD > 0)) {
      throw new ConflictException('Un pendiente total no puede guardarse con billetes ni vuelto.');
    }
    const currencies = await this.loadCurrencies(client);
    const denominations = await this.loadDenominations(client);
    const shift: ShiftRow = {
      id_turno: transaction.id_turno,
      id_sucursal: transaction.id_sucursal,
      id_caja: transaction.id_caja,
      id_cajero: transaction.id_cajero,
    };
    await client.query(`delete from temo.movimientos_efectivo where id_transaccion = $1 and es_reverso = false`, [transaction.id_transaccion]);
    await client.query(`delete from temo.arqueos where id_transaccion = $1`, [transaction.id_transaccion]);

    for (const currency of ['NIO', 'USD'] as const) {
      const expectedAmount = currency === input.currencyCode ? input.amount : 0;
      if (primaryTotals[currency] > 0 || expectedAmount > 0) {
        await this.persistCashCount(client, {
          transactionId: transaction.id_transaccion, shift, userId, rateId,
          rateKind: this.transactionRateKind(direction, input.currencyCode),
          rateValue: this.rateValue(input, this.transactionRateKind(direction, input.currencyCode)),
          currency, currencyId: currencies[currency],
          type: direction === 'ENTRA' ? 'TRANSACCION_RECIBIDO' : 'TRANSACCION_ENTREGADO',
          expectedAmount, lines: input.settlement.primaryCounts[currency], denominations,
        });
      }
      if (changeTotals[currency] > 0 || input.settlement.expectedChange[currency] > 0) {
        await this.persistCashCount(client, {
          transactionId: transaction.id_transaccion, shift, userId, rateId,
          rateKind: input.settlement.changeRateKind,
          rateValue: this.rateValue(input, input.settlement.changeRateKind),
          currency, currencyId: currencies[currency], type: 'TRANSACCION_VUELTO',
          expectedAmount: input.settlement.expectedChange[currency],
          lines: input.settlement.changeCounts[currency], denominations,
        });
      }
      if (primaryTotals[currency] > 0) {
        await this.persistTransactionCashMovement(client, transaction.id_transaccion, shift, currencies[currency], direction, primaryTotals[currency]);
      }
      if (changeTotals[currency] > 0) {
        await this.persistTransactionCashMovement(client, transaction.id_transaccion, shift, currencies[currency], 'SALE', changeTotals[currency]);
      }
    }

    await this.applySettlementDeltaToCurrentCashCount(client, transaction.id_turno, previous, {
      independent: true,
      primaryDirection: direction,
      primaryCounts: input.settlement.primaryCounts,
      changeCounts: input.settlement.changeCounts,
    });
  }

  private async applySettlementDeltaToCurrentCashCount(
    client: PoolClient,
    shiftId: string,
    previous: StoredSettlement,
    next: StoredSettlement,
  ) {
    const quantityMap = (counts: CashCounts, currency: CurrencyCode) =>
      new Map(counts[currency].map((line) => [
        Number(line.denomination),
        line.piles25 * 25 + line.loose,
      ]));

    for (const currency of ['NIO', 'USD'] as const) {
      const cashCount = await client.query<{ id_arqueo: string } & QueryResultRow>(
        `select a.id_arqueo
         from temo.arqueos a
         join temo.monedas m on m.id_moneda = a.id_moneda
         where a.id_turno = $1 and a.tipo = 'ACTUAL' and m.codigo = $2
         order by a.fecha_creacion desc limit 1
         for update of a`,
        [shiftId, currency],
      );
      const cashCountId = cashCount.rows[0]?.id_arqueo;
      if (!cashCountId) continue;

      const oldPrimary = quantityMap(previous.primaryCounts, currency);
      const oldChange = quantityMap(previous.changeCounts, currency);
      const newPrimary = quantityMap(next.primaryCounts, currency);
      const newChange = quantityMap(next.changeCounts, currency);
      const rows = await client.query<{
        id_denominacion: string;
        value: string;
        quantity: number;
        piles25: number;
      } & QueryResultRow>(
        `select
           d.id_denominacion,
           d.valor as value,
           coalesce(ad.cantidad, 0)::integer as quantity,
           coalesce(ad.montones_25, 0)::integer as "piles25"
         from temo.denominaciones d
         join temo.monedas m on m.id_moneda = d.id_moneda
         left join temo.arqueos_denominaciones ad
           on ad.id_denominacion = d.id_denominacion and ad.id_arqueo = $1
         where m.codigo = $2 and d.estado = 'ACTIVO'`,
        [cashCountId, currency],
      );

      for (const row of rows.rows) {
        const value = Number(row.value);
        const oldNet =
          (oldPrimary.get(value) ?? 0) * (previous.primaryDirection === 'ENTRA' ? 1 : -1) -
          (oldChange.get(value) ?? 0);
        const newNet =
          (newPrimary.get(value) ?? 0) * (next.primaryDirection === 'ENTRA' ? 1 : -1) -
          (newChange.get(value) ?? 0);
        const quantity = Math.max(0, Number(row.quantity) + newNet - oldNet);
        const keepsLooseCounting = Number(row.piles25) === 0;
        await client.query(
          `insert into temo.arqueos_denominaciones (
             id_arqueo, id_denominacion, cantidad, monto, montones_25, sueltos
           ) values (
             $1,
             $2,
             $3::integer,
             $3::integer * $4::numeric,
             case when $5::boolean then 0 else floor($3::integer / 25.0)::integer end,
             case when $5::boolean then $3::integer else mod($3::integer, 25) end
           )
           on conflict (id_arqueo, id_denominacion) do update
           set cantidad = excluded.cantidad,
               monto = excluded.monto,
               montones_25 = excluded.montones_25,
               sueltos = excluded.sueltos`,
          [cashCountId, row.id_denominacion, quantity, value, keepsLooseCounting],
        );
      }
      await client.query(
        `update temo.arqueos a
         set monto_total = coalesce((
           select sum(ad.monto) from temo.arqueos_denominaciones ad where ad.id_arqueo = a.id_arqueo
         ), 0), fecha_creacion = now()
         where a.id_arqueo = $1`,
        [cashCountId],
      );
    }
  }

  private async applySettlementToCurrentCashCount(
    client: PoolClient,
    shiftId: string,
    primaryDirection: MoneyDirection,
    primary: CreateTransactionBatchInput['settlement']['primaryCounts'],
    change: CreateTransactionBatchInput['settlement']['changeCounts'],
  ) {
    for (const currency of ['NIO', 'USD'] as CurrencyCode[]) {
      const cashCount = await client.query<{ id_arqueo: string } & QueryResultRow>(
        `select a.id_arqueo
         from temo.arqueos a
         join temo.monedas m on m.id_moneda = a.id_moneda
         where a.id_turno = $1 and a.tipo = 'ACTUAL' and m.codigo = $2
         order by a.fecha_creacion desc limit 1`,
        [shiftId, currency],
      );
      const cashCountId = cashCount.rows[0]?.id_arqueo;
      if (!cashCountId) {
        continue;
      }
      const primaryByValue = new Map(primary[currency].map((line) => [line.denomination, line.piles25 * 25 + line.loose]));
      const changeByValue = new Map(change[currency].map((line) => [line.denomination, line.piles25 * 25 + line.loose]));
      const rows = await client.query<{ id: string; value: string; quantity: number; piles25: number; loose: number } & QueryResultRow>(
        `select ad.id_arqueo_denominacion as id, d.valor as value, ad.cantidad as quantity,
           ad.montones_25 as "piles25", ad.sueltos as loose
         from temo.arqueos_denominaciones ad
         join temo.denominaciones d on d.id_denominacion = ad.id_denominacion
         where ad.id_arqueo = $1`,
        [cashCountId],
      );
      for (const row of rows.rows) {
        const value = Number(row.value);
        const primaryDelta = (primaryByValue.get(value) ?? 0) * (primaryDirection === 'ENTRA' ? 1 : -1);
        const changeDelta = changeByValue.get(value) ?? 0;
        const quantity = Math.max(0, Number(row.quantity) + primaryDelta - changeDelta);
        const keepsLooseCounting = Number(row.piles25) === 0;
        await client.query(
          `update temo.arqueos_denominaciones
           set
             cantidad = $2::integer,
             montones_25 = case when $4::boolean then 0 else floor($2::integer / 25.0)::integer end,
             sueltos = case when $4::boolean then $2::integer else mod($2::integer, 25) end,
             monto = $2::integer * $3::numeric
           where id_arqueo_denominacion = $1`,
          [row.id, quantity, value, keepsLooseCounting],
        );
      }
      await client.query(
        `update temo.arqueos a set monto_total = coalesce((select sum(ad.monto) from temo.arqueos_denominaciones ad where ad.id_arqueo = a.id_arqueo), 0), fecha_creacion = now() where a.id_arqueo = $1`,
        [cashCountId],
      );
    }
  }

  private async refreshShiftAccountBalances(
    client: PoolClient,
    shiftId: string,
  ) {
    await client.query(
      `insert into temo.saldos_turno_cuentas (
         id_turno,
         id_cuenta,
         saldo_inicial
       )
       select distinct tr.id_turno, mc.id_cuenta, 0
       from temo.movimientos_cuentas mc
       join temo.transacciones tr on tr.id_transaccion = mc.id_transaccion
       where tr.id_turno = $1
         and tr.estado <> 'ANULADA'
       on conflict (id_turno, id_cuenta) do nothing`,
      [shiftId],
    );

    await client.query(
      `update temo.saldos_turno_cuentas stc
       set saldo_final_calculado = stc.saldo_inicial + coalesce((
         select sum(case movements.direccion when 'ENTRA' then movements.monto else -movements.monto end)
         from (
           /* Suma transacciones vigentes y omite cualquier operacion anulada. */
           select mc.direccion, mc.monto
           from temo.movimientos_cuentas mc
           join temo.transacciones tr on tr.id_transaccion = mc.id_transaccion
           where mc.id_cuenta = stc.id_cuenta
             and tr.id_turno = stc.id_turno
             and tr.estado <> 'ANULADA'
           union all
           /* Incluye transferencias digitales activas sin reintroducir sus reversos. */
           select mc.direccion, mc.monto
           from temo.movimientos_cuentas mc
           join temo.transferencias tf on tf.id_transferencia = mc.id_transferencia
           where mc.id_cuenta = stc.id_cuenta
             and tf.id_turno = stc.id_turno
             and tf.estado = 'ACTIVO'
         ) movements
       ), 0)
       where stc.id_turno = $1`,
      [shiftId],
    );
  }

  private async resolveUser(
    client: PoolClient,
    requestedUserId: string | undefined,
    fallbackUserId: string,
  ) {
    const userId = requestedUserId ?? fallbackUserId;
    const result = await client.query(
      `select 1
       from temo.usuarios
       where id_usuario = $1 and estado = 'ACTIVO'`,
      [userId],
    );
    if (!result.rowCount) {
      throw new NotFoundException('El usuario de la transaccion no esta activo.');
    }
    return userId;
  }

  private async loadCurrencies(client: PoolClient) {
    const result = await client.query<CurrencyRow>(
      `select id_moneda, codigo
       from temo.monedas
       where codigo in ('NIO', 'USD') and estado = 'ACTIVO'`,
    );
    const currencies = Object.fromEntries(
      result.rows.map((row) => [row.codigo, row.id_moneda]),
    ) as Partial<Record<CurrencyCode, string>>;
    if (!currencies.NIO || !currencies.USD) {
      throw new ConflictException('No estan configuradas las monedas NIO y USD.');
    }
    return currencies as Record<CurrencyCode, string>;
  }

  private async resolveExchangeRate(
    client: PoolClient,
    input: { rates: { buy: number; sell: number } },
    userId: string,
  ) {
    const current = await client.query<{ id_tipo_cambio: string } & QueryResultRow>(
      `select id_tipo_cambio
       from temo.tipos_cambio
       where tasa_compra = $1 and tasa_venta = $2
       order by vigente_desde desc
       limit 1`,
      [input.rates.buy, input.rates.sell],
    );
    if (current.rows[0]) {
      return current.rows[0].id_tipo_cambio;
    }
    const inserted = await client.query<{
      id_tipo_cambio: string;
    } & QueryResultRow>(
      `insert into temo.tipos_cambio (
         tasa_compra, tasa_venta, id_usuario_creacion, observaciones
       )
       values ($1, $2, $3, 'Registrada al guardar grupo de transacciones')
       returning id_tipo_cambio`,
      [input.rates.buy, input.rates.sell, userId],
    );
    return inserted.rows[0].id_tipo_cambio;
  }

  private async loadPaymentMethods(client: PoolClient) {
    const result = await client.query<{ id_metodo_pago: string; codigo: string } & QueryResultRow>(
      `select id_metodo_pago, codigo
       from temo.metodos_pago
       where codigo in ('EFECTIVO', 'CREDITO') and estado = 'ACTIVO'`,
    );
    const methods = Object.fromEntries(
      result.rows.map((row) => [row.codigo, row.id_metodo_pago]),
    ) as Partial<Record<'EFECTIVO' | 'CREDITO', string>>;
    if (!methods.EFECTIVO || !methods.CREDITO) {
      throw new ConflictException(
        'Faltan los metodos de pago EFECTIVO o CREDITO.',
      );
    }
    return methods as Record<'EFECTIVO' | 'CREDITO', string>;
  }

  private async resolveCounterpart(client: PoolClient, name: string) {
    const result = await client.query<{ id_contraparte: string } & QueryResultRow>(
      `insert into temo.contrapartes (nombre, tipo)
       values ($1, 'CLIENTE_PROVEEDOR')
       on conflict (nombre, tipo)
       do update set estado = 'ACTIVO'
       returning id_contraparte`,
      [name],
    );
    return result.rows[0].id_contraparte;
  }

  private async resolveMovement(
    client: PoolClient,
    branchId: string,
    entityCode: string,
    currencyCode: CurrencyCode,
    movementCode: string,
  ) {
    const result = await client.query<MovementRow>(
      `select
         cm.id_cuenta_movimiento,
         cb.id_cuenta,
         cm.id_movimiento,
         e.id_entidad,
         mo.id_moneda,
         cm.nombre_operativo,
         ef.direccion_efectivo,
         coalesce(ef.afecta_cuenta, false) as afecta_cuenta,
         ef.direccion_cuenta,
         coalesce(ef.genera_pendiente, false) as genera_pendiente,
         ef.tipo_pendiente
       from temo.cuentas_movimientos cm
       join temo.cuentas_bancarias cb on cb.id_cuenta = cm.id_cuenta
       join temo.entidades_bancarias e on e.id_entidad = cb.id_entidad
       join temo.monedas mo on mo.id_moneda = cb.id_moneda
       left join temo.efectos_movimientos ef
         on ef.id_cuenta_movimiento = cm.id_cuenta_movimiento
       where e.codigo = $1
         and mo.codigo = $2
         and upper(cm.codigo_operativo) = upper($3)
         and cm.estado = 'ACTIVO'
         and cb.estado = 'ACTIVO'
         and (
           not exists (
             select 1
             from temo.cuentas_sucursales all_cs
             where all_cs.id_cuenta = cb.id_cuenta
           )
           or exists (
             select 1
             from temo.cuentas_sucursales branch_cs
             where branch_cs.id_cuenta = cb.id_cuenta
               and branch_cs.id_sucursal = $4
           )
         )
       order by
         exists (
           select 1
           from temo.cuentas_sucursales preferred_cs
           where preferred_cs.id_cuenta = cb.id_cuenta
             and preferred_cs.id_sucursal = $4
         ) desc,
         cb.consecutivo
       limit 1`,
      [
        entityCode.toUpperCase(),
        currencyCode,
        movementCode.toUpperCase(),
        branchId,
      ],
    );
    if (!result.rows[0]) {
      const availability = await client.query<{
        branch_name: string;
        account_aliases: string | null;
      }>(
        `select
           s.nombre as branch_name,
           (
             select string_agg(distinct cb.alias, ', ' order by cb.alias)
             from temo.cuentas_movimientos cm
             join temo.cuentas_bancarias cb on cb.id_cuenta = cm.id_cuenta
             join temo.entidades_bancarias e on e.id_entidad = cb.id_entidad
             join temo.monedas mo on mo.id_moneda = cb.id_moneda
             where e.codigo = $1
               and mo.codigo = $2
               and upper(cm.codigo_operativo) = upper($3)
               and cm.estado = 'ACTIVO'
               and cb.estado = 'ACTIVO'
           ) as account_aliases
         from temo.sucursales s
         where s.id_sucursal = $4`,
        [entityCode.toUpperCase(), currencyCode, movementCode.toUpperCase(), branchId],
      );
      const movementAvailability = availability.rows[0];
      if (movementAvailability?.account_aliases) {
        throw new ConflictException(
          `El movimiento ${movementCode} para ${entityCode} ${currencyCode} existe, pero la cuenta ${movementAvailability.account_aliases} no está asociada a la sucursal ${movementAvailability.branch_name}. Configure su alcance en Cuentas antes de registrar la transacción.`,
        );
      }
      throw new NotFoundException(
        `No existe un movimiento activo ${movementCode} para ${entityCode} ${currencyCode}.`,
      );
    }
    return result.rows[0];
  }

  private async persistCommission(
    client: PoolClient,
    transactionId: string,
    movement: MovementRow,
    amount: number,
  ) {
    const result = await client.query<CommissionRuleRow>(
      `select
         id_comision,
         id_moneda_comision,
         tipo_calculo,
         porcentaje,
         monto_fijo
       from temo.reglas_comisiones
       where id_entidad = $1
         and id_moneda = $2
         and id_movimiento = $3
         and estado = 'ACTIVO'
         and fecha_inicio <= current_date
         and (fecha_fin is null or fecha_fin >= current_date)
         and (rango_inicio is null or rango_inicio <= $4)
         and (rango_fin is null or rango_fin >= $4)
       order by rango_inicio desc nulls last, fecha_inicio desc
       limit 1`,
      [
        movement.id_entidad,
        movement.id_moneda,
        movement.id_movimiento,
        amount,
      ],
    );
    const rule = result.rows[0];
    if (!rule || rule.tipo_calculo === 'MANUAL') {
      return;
    }

    const commission =
      rule.tipo_calculo === 'FIJO'
        ? Number(rule.monto_fijo ?? 0)
        : (amount * Number(rule.porcentaje ?? 0)) / 100;
    const roundedCommission = Math.round(commission * 10000) / 10000;
    await client.query(
      `insert into temo.transacciones_comisiones (
         id_transaccion,
         id_comision,
         id_moneda,
         monto,
         detalle_calculo,
         calculada_automaticamente,
         oculta_para_cajero
       )
       values ($1, $2, $3, $4, $5::jsonb, true, true)`,
      [
        transactionId,
        rule.id_comision,
        rule.id_moneda_comision ?? movement.id_moneda,
        roundedCommission,
        JSON.stringify({
          tipo: rule.tipo_calculo,
          porcentaje: rule.porcentaje,
          montoFijo: rule.monto_fijo,
          base: amount,
        }),
      ],
    );
  }

  private async loadDenominations(client: PoolClient) {
    const result = await client.query<DenominationRow>(
      `select d.id_denominacion, d.id_moneda, m.codigo as codigo_moneda, d.valor
       from temo.denominaciones d
       join temo.monedas m on m.id_moneda = d.id_moneda
       where d.estado = 'ACTIVO' and m.codigo in ('NIO', 'USD')`,
    );
    return new Map(
      result.rows.map((row) => [
        this.denominationKey(row.codigo_moneda, Number(row.valor)),
        row.id_denominacion,
      ]),
    );
  }

  // Persiste el arqueo y el movimiento fisico de cada pestaña por separado.
  private async persistIndependentSettlements(
    client: PoolClient,
    input: CreateTransactionBatchInput,
    persisted: PersistedTransaction[],
    shift: ShiftRow,
    rateId: string,
    userId: string,
    currencies: Record<CurrencyCode, string>,
    denominations: Map<string, string>,
  ) {
    for (const [index, transaction] of input.transactions.entries()) {
      const settlement = transaction.settlement ?? input.settlement;
      const saved = persisted[index];
      const primaryTotals = this.cashTotals(settlement.primaryCounts);
      const changeTotals = this.cashTotals(settlement.changeCounts);
      const direction = saved.direction;
      const primaryType = direction === 'ENTRA' ? 'TRANSACCION_RECIBIDO' : 'TRANSACCION_ENTREGADO';
      const rateKind = this.transactionRateKind(direction, transaction.currencyCode);

      for (const currency of ['NIO', 'USD'] as const) {
        const expectedAmount = currency === transaction.currencyCode ? transaction.amount : 0;
        if (primaryTotals[currency] > 0 || expectedAmount > 0) {
          await this.persistCashCount(client, {
            transactionId: saved.id,
            shift,
            userId,
            rateId,
            rateKind,
            rateValue: this.rateValue(input, rateKind),
            currency,
            currencyId: currencies[currency],
            type: primaryType,
            expectedAmount,
            lines: settlement.primaryCounts[currency],
            denominations,
          });
        }
        if (changeTotals[currency] > 0 || settlement.expectedChange[currency] > 0) {
          await this.persistCashCount(client, {
            transactionId: saved.id,
            shift,
            userId,
            rateId,
            rateKind: settlement.changeRateKind,
            rateValue: this.rateValue(input, settlement.changeRateKind),
            currency,
            currencyId: currencies[currency],
            type: 'TRANSACCION_VUELTO',
            expectedAmount: settlement.expectedChange[currency],
            lines: settlement.changeCounts[currency],
            denominations,
          });
        }
        if (primaryTotals[currency] > 0) {
          await this.persistTransactionCashMovement(client, saved.id, shift, currencies[currency], direction, primaryTotals[currency]);
        }
        if (changeTotals[currency] > 0) {
          await this.persistTransactionCashMovement(client, saved.id, shift, currencies[currency], 'SALE', changeTotals[currency]);
        }
      }

      await this.applySettlementToCurrentCashCount(
        client,
        shift.id_turno,
        direction,
        settlement.primaryCounts,
        settlement.changeCounts,
      );
    }
  }

  private async persistCashCount(
    client: PoolClient,
    data: {
      groupId?: string;
      transactionId?: string;
      shift: ShiftRow;
      userId: string;
      rateId: string;
      rateKind: RateKind;
      rateValue: number;
      currency: CurrencyCode;
      currencyId: string;
      type:
        | 'TRANSACCION_RECIBIDO'
        | 'TRANSACCION_ENTREGADO'
        | 'TRANSACCION_VUELTO';
      expectedAmount: number;
      lines: CreateTransactionBatchInput['settlement']['primaryCounts'][CurrencyCode];
      denominations: Map<string, string>;
    },
  ) {
    const result = await client.query<{ id_arqueo: string } & QueryResultRow>(
      `insert into temo.arqueos (
         id_caja,
         tipo,
         id_moneda,
         id_usuario_creacion,
         id_grupo_transacciones,
         id_transaccion,
         id_tipo_cambio,
         tipo_tasa,
         tasa_usada,
         monto_esperado
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id_arqueo`,
      [
        data.shift.id_caja,
        data.type,
        data.currencyId,
        data.userId,
        data.groupId,
        data.transactionId ?? null,
        data.rateId,
        data.rateKind,
        data.rateValue,
        data.expectedAmount,
      ],
    );
    const cashCountId = result.rows[0].id_arqueo;

    for (const line of data.lines) {
      const quantity = line.piles25 * 25 + line.loose;
      if (!quantity) {
        continue;
      }
      const denominationId = data.denominations.get(
        this.denominationKey(data.currency, line.denomination),
      );
      if (!denominationId) {
        throw new NotFoundException(
          `La denominacion ${line.denomination} ${data.currency} no esta configurada.`,
        );
      }
      await client.query(
        `insert into temo.arqueos_denominaciones (
           id_arqueo,
           id_denominacion,
           cantidad,
           monto,
           montones_25,
           sueltos
         )
         values ($1, $2, 0, 0, $3, $4)`,
        [cashCountId, denominationId, line.piles25, line.loose],
      );
    }
  }

  private async persistPendingCashCount(
    client: PoolClient,
    data: {
      paymentId: string;
      userId: string;
      rateId: string;
      rateKind: RateKind;
      rateValue: number;
      currency: CurrencyCode;
      currencyId: string;
      type:
        | 'PENDIENTE_RECIBIDO'
        | 'PENDIENTE_ENTREGADO'
        | 'PENDIENTE_VUELTO';
      expectedAmount: number;
      lines: PayPendingInput['settlement']['primaryCounts'][CurrencyCode];
      denominations: Map<string, string>;
    },
  ) {
    const result = await client.query<{ id_arqueo: string } & QueryResultRow>(
      `insert into temo.arqueos (
         tipo,
         id_moneda,
         id_usuario_creacion,
         id_abono_pendiente,
         id_tipo_cambio,
         tipo_tasa,
         tasa_usada,
         monto_esperado
       ) values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id_arqueo`,
      [
        data.type,
        data.currencyId,
        data.userId,
        data.paymentId,
        data.rateId,
        data.rateKind,
        data.rateValue,
        data.expectedAmount,
      ],
    );
    const cashCountId = result.rows[0].id_arqueo;

    for (const line of data.lines) {
      const quantity = line.piles25 * 25 + line.loose;
      if (!quantity) continue;

      const denominationId = data.denominations.get(
        this.denominationKey(data.currency, line.denomination),
      );
      if (!denominationId) {
        throw new NotFoundException(
          `La denominacion ${line.denomination} ${data.currency} no esta configurada.`,
        );
      }
      await client.query(
        `insert into temo.arqueos_denominaciones (
           id_arqueo, id_denominacion, cantidad, monto, montones_25, sueltos
         ) values ($1, $2, 0, 0, $3, $4)`,
        [cashCountId, denominationId, line.piles25, line.loose],
      );
    }
  }

  private persistCashMovement(
    client: PoolClient,
    groupId: string,
    shift: ShiftRow,
    currencyId: string,
    direction: MoneyDirection,
    amount: number,
  ) {
    return client.query(
      `insert into temo.movimientos_efectivo (
         id_grupo_transacciones,
         id_turno,
         id_caja,
         id_moneda,
         direccion,
         monto
       )
       values ($1, $2, $3, $4, $5, $6)`,
      [
        groupId,
        shift.id_turno,
        shift.id_caja,
        currencyId,
        direction,
        amount,
      ],
    );
  }

  // Vincula el efectivo con la pestaña que lo recibió o entregó dentro del grupo.
  private persistTransactionCashMovement(
    client: PoolClient,
    transactionId: string,
    shift: ShiftRow,
    currencyId: string,
    direction: MoneyDirection,
    amount: number,
  ) {
    return client.query(
      `insert into temo.movimientos_efectivo (
         id_transaccion,id_turno,id_caja,id_moneda,direccion,monto
       ) values ($1,$2,$3,$4,$5,$6)`,
      [transactionId, shift.id_turno, shift.id_caja, currencyId, direction, amount],
    );
  }

  private persistPendingCashMovement(
    client: PoolClient,
    paymentId: string,
    shift: ShiftRow,
    currencyId: string,
    direction: MoneyDirection,
    amount: number,
  ) {
    return client.query(
      `insert into temo.movimientos_efectivo (
         id_abono_pendiente,
         id_turno,
         id_caja,
         id_moneda,
         direccion,
         monto
       ) values ($1, $2, $3, $4, $5, $6)`,
      [
        paymentId,
        shift.id_turno,
        shift.id_caja,
        currencyId,
        direction,
        amount,
      ],
    );
  }

  private cashTotals(
    counts: CreateTransactionBatchInput['settlement']['primaryCounts'],
  ) {
    return (['NIO', 'USD'] as const).reduce<Record<CurrencyCode, number>>(
      (totals, currency) => {
        totals[currency] = counts[currency].reduce(
          (total, line) =>
            total +
            (line.piles25 * 25 + line.loose) * line.denomination,
          0,
        );
        return totals;
      },
      { NIO: 0, USD: 0 },
    );
  }

  private transactionRateKind(
    direction: MoneyDirection,
    currency: CurrencyCode,
  ): RateKind {
    if (
      (direction === 'ENTRA' && currency === 'NIO') ||
      (direction === 'SALE' && currency === 'USD')
    ) {
      return 'COMPRA';
    }
    return 'VENTA';
  }

  private rateValue(input: { rates: { buy: number; sell: number } }, kind: RateKind) {
    return kind === 'COMPRA' ? input.rates.buy : input.rates.sell;
  }

  private denominationKey(currency: CurrencyCode, value: number) {
    return `${currency}:${Number(value).toFixed(2)}`;
  }

  private normalizeIp(ip?: string) {
    if (!ip) {
      return null;
    }
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }
}
