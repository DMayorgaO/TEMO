const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { ShiftsService } = require('../dist/modules/shifts/shifts.service');
const { TransactionsService } = require('../dist/modules/transactions/transactions.service');
const { TransfersService } = require('../dist/modules/transfers/transfers.service');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');
const { createTransactionBatchSchema, payPendingBatchSchema } = require('../dist/modules/transactions/transaction-batch.schema');
const { openShiftSchema } = require('../dist/modules/shifts/shifts.schema');

const counts = (amount) => ({ NIO: amount ? [{ denomination: 10, piles25: 0, loose: amount / 10 }] : [], USD: [] });
const settlement = (amount = 0, change = 0) => ({ primaryRateKind: 'COMPRA', changeRateKind: 'COMPRA',
  expectedChange: { NIO: change, USD: 0 }, primaryCounts: counts(amount), changeCounts: counts(change) });
const rates = { buy: 36.4, sell: 37 };
const near = (actual, expected) => assert.ok(Math.abs(Number(actual) - Number(expected)) < 0.0001, `${actual} != ${expected}`);

test('financial regression in local preview with rollback', { skip: !process.env.TEMO_TEST_PREVIEW }, async (t) => {
  const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
    options: '-c search_path=temo,extensions,public', statement_timeout: 15000 });
  await client.connect();
  const username = `security_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('begin');
    let savepoint = 0;
    const db = { query: (sql, params) => client.query(sql, params), transaction: async (work) => {
      const name = `regression_${++savepoint}`;
      await client.query(`savepoint ${name}`);
      try {
        const result = await work(client);
        await client.query(`release savepoint ${name}`);
        return result;
      } catch (error) {
        await client.query(`rollback to savepoint ${name}`);
        await client.query(`release savepoint ${name}`);
        throw error;
      }
    } };
    const shifts = new ShiftsService(db);
    const transactions = new TransactionsService(db);
    const transfers = new TransfersService(db);
    const catalogs = new CatalogsController(db, {});
    const adminRow = (await client.query("select u.id_usuario as id from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='JEFA' and u.estado='ACTIVO' limit 1")).rows[0];
    assert.ok(adminRow);
    const admin = { id: adminRow.id, roleCode: 'JEFA' };
    const userRow = (await client.query(`insert into temo.usuarios (id_rol,nombres,apellidos,usuario,contrasena_hash,estado)
      select id_rol,'Security','Regression',$1,'not-a-login-credential','ACTIVO' from temo.roles where codigo='CAJERO'
      returning id_usuario as id`, [username])).rows[0];
    const cashier = { id: userRow.id, roleCode: 'CAJERO' };
    const branch = (await client.query(`select s.id_sucursal as id,s.nombre from temo.sucursales s
      join temo.cuentas_sucursales cs using(id_sucursal) join temo.cuentas_bancarias c using(id_cuenta)
      join temo.entidades_bancarias e using(id_entidad) join temo.monedas m using(id_moneda)
      where s.estado='ACTIVO' and c.estado='ACTIVO' and e.codigo='BAC' and m.codigo='NIO' limit 1`)).rows[0];
    assert.ok(branch, 'preview requires an active BAC NIO account');
    await client.query('insert into temo.usuarios_sucursales (id_usuario,id_sucursal) values($1,$2)', [cashier.id, branch.id]);
    let shift;
    await t.test('Administrator prepares, only assigned cashier opens; accounts remain available', async () => {
      const input = openShiftSchema.parse({ branchId: branch.id, branch: branch.nombre, register: 'Security regression',
        cashier: username, counts: counts(1000), balances: [], prepared: true });
      await assert.rejects(shifts.create(input, cashier), (error) => error.getStatus() === 403);
      const prepared = await shifts.create(input, admin);
      const id = prepared.database_id ?? prepared.id_turno;
      assert.ok(id, 'prepared shift id');
      await assert.rejects(shifts.openPrepared(id, { id: admin.id, roleCode: 'CAJERO' }), (error) => error.getStatus() === 403);
      await shifts.openPrepared(id, cashier);
      shift = await shifts.detail(id, cashier);
      near(shift.expectedCash.NIO, 1000);
      const accounts = await catalogs.cuentasBancarias({ user: cashier });
      assert.ok(accounts.some((row) => row.entidad === 'BAC' && row.moneda === 'NIO'));
      assert.ok(accounts.every((row) => row.numero_cuenta === ''));
    });
    assert.ok(shift);
    const shiftId = shift.database_id ?? shift.id_turno;
    const batch = (items, cash) => createTransactionBatchSchema.parse({ shiftId, userId: cashier.id, rates,
      transactions: items.map((item) => ({ entityCode: 'BAC', movementCode: 'DC', currencyCode: 'NIO', ...item })), settlement: cash });
    const summary = () => shifts.detail(shiftId, cashier);
    let deposit;
    await t.test('Cash deposit changes physical expectation and bank balance once', async () => {
      const before = await summary();
      deposit = await transactions.createBatch(batch([{ amount: 100 }], settlement(100)), {});
      const after = await summary();
      near(after.expectedCash.NIO, before.expectedCash.NIO + 100);
      const movement = (await client.query('select id_cuenta,direccion,monto from temo.movimientos_cuentas where id_transaccion=$1', [deposit.transactions[0].id])).rows[0];
      assert.ok(movement);
      const oldBank = before.balances.find((row) => row.account_id === movement.id_cuenta);
      const newBank = after.balances.find((row) => row.account_id === movement.id_cuenta);
      near(newBank.calculated, Number(oldBank.calculated) + (movement.direccion === 'ENTRA' ? 100 : -100));
      near(newBank.system, newBank.calculated);
    });
    await t.test('Another cashier cannot read or void this transaction', async () => {
      const outsider = { id: admin.id, roleCode: 'CAJERO' };
      await assert.rejects(transactions.detail(deposit.transactions[0].id, outsider), (error) => [403, 404].includes(error.getStatus()));
      await assert.rejects(transactions.void(deposit.transactions[0].id, outsider), (error) => [403, 404].includes(error.getStatus()));
    });
    await t.test('Multiple withdrawal and deposit net to cash delivered; void restores cash', async () => {
      const before = await summary();
      const group = await transactions.createBatch(batch([{ movementCode: 'RE', amount: 100 }, { amount: 60 }], settlement(40)), {});
      assert.deepEqual(group.transactions.map((row) => row.order), [1, 2]);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO - 40);
      await assert.rejects(transactions.void(group.transactions[0].id, cashier), (error) => error.getStatus() === 409);
      const result = await transactions.updateGroup(group.transactions[0].id, {
        updates: [], voidIds: group.transactions.map((row) => row.id), preferential: false,
      }, cashier);
      assert.equal(result.voided, 2);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
    });
    await t.test('Three credit pendings: empty cash rejected atomically, cash payment with change reconciles', async () => {
      const before = await summary();
      const pendingIds = [];
      for (const amount of [30, 40, 50]) {
        const group = await transactions.createBatch(batch([{ amount, pendingName: 'SECURITY REGRESSION' }], settlement()), {});
        const pending = (await client.query('select id_pendiente as id from temo.pagos_pendientes where id_transaccion=$1', [group.transactions[0].id])).rows[0];
        assert.ok(pending);
        pendingIds.push(pending.id);
      }
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
      const pendingBalances = (await summary()).balances;
      const pay = (cash) => payPendingBatchSchema.parse({ pendingIds, method: 'EFECTIVO', rates, settlement: cash });
      await assert.rejects(transactions.payPendingBatch(pay(settlement()), cashier), (error) => error.getStatus() === 409);
      const failedPayments = await client.query('select count(*)::int as n from temo.abonos_pendientes where id_pendiente=any($1::uuid[])', [pendingIds]);
      assert.equal(failedPayments.rows[0].n, 0);
      const paid = await transactions.payPendingBatch(pay(settlement(130, 10)), cashier);
      assert.equal(paid.estado, 'PAGADO');
      const after = await summary();
      near(after.expectedCash.NIO, before.expectedCash.NIO + 120);
      for (const old of pendingBalances) near(after.balances.find((row) => row.account_id === old.account_id).calculated, old.calculated);
      const rows = (await client.query('select estado,saldo_pendiente from temo.pagos_pendientes where id_pendiente=any($1::uuid[])', [pendingIds])).rows;
      assert.equal(rows.length, 3);
      assert.ok(rows.every((row) => row.estado === 'PAGADO' && Number(row.saldo_pendiente) === 0));
    });
    await t.test('USD cash deposit uses normal buy rate in consolidated cash', async () => {
      const before = await summary();
      const cash = settlement();
      cash.primaryCounts.USD = [{ denomination: 100, piles25: 0, loose: 1 }];
      const group = await transactions.createBatch(batch([{ amount: 100, currencyCode: 'USD' }], cash), {});
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO + 3640);
      const stored = (await client.query('select tasa_compra_usada,tasa_venta_usada from temo.transacciones where id_transaccion=$1', [group.transactions[0].id])).rows[0];
      near(stored.tasa_compra_usada, 36.4);
      near(stored.tasa_venta_usada, 37);
      await transactions.void(group.transactions[0].id, cashier);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
    });
    await t.test('Preferential USD withdrawal offsets NIO deposit without fictitious cash deficit', async () => {
      const before = await summary();
      const input = batch([{ movementCode: 'RE', amount: 100, currencyCode: 'USD' }, { amount: 3655 }], settlement());
      input.specialExchangeRate = 36.55;
      const group = await transactions.createBatch(createTransactionBatchSchema.parse(input), {});
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
      const stored = (await client.query('select tasa_compra_usada from temo.transacciones where id_grupo_transacciones=$1', [group.groupId])).rows;
      assert.equal(stored.length, 2);
      stored.forEach((row) => near(row.tasa_compra_usada, 36.55));
      await transactions.updateGroup(group.transactions[0].id, {
        updates: [], voidIds: group.transactions.map((row) => row.id), preferential: true,
      }, cashier);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
    });
    await t.test('Cashier cash transfer decreases cash and void restores it; digital creation denied', async () => {
      const before = await summary();
      const input = { shiftId, type: 'EFECTIVO', direction: 'EGRESO', currency: 'NIO',
        amount: 20, description: 'SECURITY REGRESSION', cashLines: counts(20).NIO };
      await assert.rejects(transfers.create({ ...input, type: 'DIGITAL' }, cashier), (error) => error.getStatus() === 403);
      const transfer = await transfers.create(input, cashier);
      const id = transfer.database_id ?? transfer.id_transferencia;
      assert.ok(id);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO - 20);
      await assert.rejects(transfers.detail(id, { id: admin.id, roleCode: 'CAJERO' }), (error) => error.getStatus() === 403);
      await transfers.void(id, 'Reversion de prueba aislada', cashier);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
    });
    await t.test('Withdrawal 380 pays pending 180 and deposit 200 without reducing physical cash', async () => {
      const credit = await transactions.createBatch(batch([{ amount: 180, pendingName: 'SECURITY COMPENSATION' }], settlement()), {});
      const pending = (await client.query('select id_pendiente as id from temo.pagos_pendientes where id_transaccion=$1', [credit.transactions[0].id])).rows[0];
      const before = await summary();
      const input = batch([{ movementCode: 'RE', amount: 380 }, { amount: 200 }], settlement());
      input.pendingSettlementIds = [pending.id];
      const group = await transactions.createBatch(createTransactionBatchSchema.parse(input), {});
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
      const paid = (await client.query('select estado,saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1', [pending.id])).rows[0];
      assert.equal(paid.estado, 'PAGADO');
      near(paid.saldo_pendiente, 0);
      await transactions.updateGroup(group.transactions[0].id, {
        updates: [], voidIds: group.transactions.map((row) => row.id), preferential: false,
      }, cashier);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
      const reopened = (await client.query('select estado,saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1', [pending.id])).rows[0];
      assert.equal(reopened.estado, 'PENDIENTE');
      near(reopened.saldo_pendiente, 180);
    });
  } finally {
    await client.query('rollback');
    const remaining = await client.query('select count(*)::int as n from temo.usuarios where usuario=$1', [username]);
    assert.equal(remaining.rows[0].n, 0, 'fixture must be rolled back');
    await client.end();
  }
});
