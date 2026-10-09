const assert = require('node:assert/strict');
const test = require('node:test');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { ShiftsService } = require('../dist/modules/shifts/shifts.service');
const { TransactionsService } = require('../dist/modules/transactions/transactions.service');
const { TransactionsController } = require('../dist/modules/transactions/transactions.controller');
const { TransfersService } = require('../dist/modules/transfers/transfers.service');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');
const { DollarPurchasesService } = require('../dist/modules/dollar-purchases/dollar-purchases.service');
const { createTransactionBatchSchema, payPendingBatchSchema, updateTransactionSchema } = require('../dist/modules/transactions/transaction-batch.schema');
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
    const purchases = new DollarPurchasesService(db);
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
    await t.test('Individual update stores comparable before/after atomically and preserves balances', async () => {
      const before = await summary();
      const created = await transactions.createBatch(batch([{ amount: 100 }], settlement(100)), {});
      const id = created.transactions[0].id;
      await transactions.update(id, updateTransactionSchema.parse({ entityCode: 'BAC', movementCode: 'DC', currencyCode: 'NIO', amount: 120, rates, settlement: settlement(120) }), cashier);
      const event = (await client.query("select id_bitacora,datos_anteriores,datos_nuevos from temo.bitacora where tabla='transacciones' and accion='ACTUALIZAR' and id_registro=$1 order by fecha_creacion desc limit 1", [id])).rows[0];
      assert.ok(event);
      near(event.datos_anteriores.amount, 100);
      near(event.datos_nuevos.amount, 120);
      near(event.datos_anteriores.rates.buy, 36.4);
      const detail = await catalogs.auditDetail(event.id_bitacora, { user: admin });
      assert.ok(detail.changes.some(change => change.field === 'Monto' && change.before === '100' && change.after === '120'));
      assert.ok(detail.changes.some(change => change.field.startsWith('Efectivo principal C$ 10') && change.before === '10 unidades' && change.after === '12 unidades'));
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO + 120);
      await transactions.void(id, cashier);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
    });
    await t.test('Group audit captures each annulled tab and cash is restored', async () => {
      const before = await summary();
      const created = await transactions.createBatch(batch([{ amount: 100 }, { amount: 60 }], settlement(160)), {});
      const ids = created.transactions.map(row => row.id);
      await transactions.updateGroup(ids[0], { updates: [], voidIds: ids, preferential: false }, cashier);
      const event = (await client.query("select id_bitacora from temo.bitacora where tabla='grupos_transacciones' and accion='ACTUALIZAR' and datos_nuevos->'voidIds' @> $1::jsonb order by fecha_creacion desc limit 1", [JSON.stringify(ids)])).rows[0];
      assert.ok(event);
      const detail = await catalogs.auditDetail(event.id_bitacora, { user: admin });
      for (const id of ids) assert.ok(detail.changes.some(row => row.field.includes(id) && row.after === 'ANULADA'));
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO);
    });
    await t.test('Closed group corrections audit original and subsequent values without changing closure cash or bank movements', async () => {
      await client.query('savepoint historical_audit');
      try {
        const created = await transactions.createBatch(batch([{ amount: 100 }, { amount: 60 }], settlement(160)), {});
        const ids = created.transactions.map(row => row.id);
        await client.query("update temo.turnos set estado='CERRADO' where id_turno=$1", [shiftId]);
        const stored = async () => (await client.query(`select
          (select jsonb_agg(to_jsonb(a) order by a.id_arqueo) from temo.arqueos a where a.id_turno=$1) as cash,
          (select jsonb_agg(to_jsonb(mc) order by mc.id_movimiento_cuenta) from temo.movimientos_cuentas mc where mc.id_transaccion=any($2::uuid[])) as bank`, [shiftId, ids])).rows[0];
        const before = await stored();
        const change = amount => updateTransactionSchema.parse({ entityCode: 'BAC', movementCode: 'DC', currencyCode: 'NIO', amount, rates, settlement: settlement(amount) });
        await assert.rejects(transactions.update(ids[0], change(120), cashier), error => error.getStatus() === 403);
        await transactions.updateGroup(ids[0], { updates: [{ id: ids[0], data: change(120) }], voidIds: [ids[1]], preferential: false }, admin);
        assert.deepEqual(await stored(), before);
        const events = await client.query("select id_bitacora,id_registro from temo.bitacora where tabla='correcciones_transacciones_cerradas' and id_registro=any($1::uuid[]) order by fecha_creacion", [ids]);
        assert.equal(events.rows.length, 2);
        const first = await catalogs.auditDetail(events.rows.find(row => row.id_registro === ids[0]).id_bitacora, { user: admin });
        assert.ok(first.changes.some(row => row.field === 'Monto' && row.before === '100' && row.after === '120'));
        const annulled = await catalogs.auditDetail(events.rows.find(row => row.id_registro === ids[1]).id_bitacora, { user: admin });
        assert.ok(annulled.changes.some(row => row.field === 'Estado' && row.after === 'ANULADA'));
        await transactions.update(ids[0], change(130), admin);
        const latest = (await client.query("select datos_anteriores,datos_nuevos from temo.bitacora where tabla='correcciones_transacciones_cerradas' and id_registro=$1 order by numero_auditoria desc limit 1", [ids[0]])).rows[0];
        near(latest.datos_anteriores.auditTransaction.amount, 120);
        near(latest.datos_nuevos.auditTransaction.amount, 130);
        assert.deepEqual(await stored(), before);
      } finally {
        await client.query('rollback to savepoint historical_audit');
        await client.query('release savepoint historical_audit');
      }
    });
    await t.test('Same-branch coworker cannot read ordinary records; shared pending groups stay accessible only in branch', async () => {
      const createCoworker = async (branchId, label) => {
        const login = `${username}_${label}`;
        const user = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado)
          select id_rol,'Scope',$1,$2,'not-a-login-credential','ACTIVO' from temo.roles where codigo='CAJERO' returning id_usuario as id`, [label, login])).rows[0];
        const identity = { id: user.id, roleCode: 'CAJERO' };
        await client.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)', [identity.id, branchId]);
        const prepared = await shifts.create(openShiftSchema.parse({ branchId, branch: branch.nombre, register: `Scope ${label}`, cashier: login, counts: counts(1000), balances: [], prepared: true }), admin);
        await shifts.openPrepared(prepared.database_id ?? prepared.id_turno, identity);
        return identity;
      };
      const colleague = await createCoworker(branch.id, 'same');
      await assert.rejects(transactions.detail(deposit.transactions[0].id, colleague), error => error.getStatus() === 403);
      await assert.rejects(transactions.groupDetail(deposit.transactions[0].id, colleague), error => error.getStatus() === 403);
      await assert.rejects(transactions.updateGroup(deposit.transactions[0].id, { updates: [], voidIds: [deposit.transactions[0].id], preferential: false }, colleague), error => error.getStatus() === 403);
      const controller = new TransactionsController(db, transactions);
      await assert.rejects(controller.exportRows({ format: 'EXCEL', ids: [deposit.transactions[0].id] }, { user: colleague }), error => error.getStatus() === 403);
      await assert.rejects(shifts.exportRows({ format: 'PDF', ids: [shiftId] }, { user: colleague }), error => error.getStatus() === 403);
      const exportable = await controller.exportRows({ format: 'PDF', ids: [deposit.transactions[0].id] }, { user: admin });
      assert.equal(exportable[0].database_id, deposit.transactions[0].id);
      const before = (await client.query('select count(*)::int as n from temo.transacciones')).rows[0].n;
      await assert.rejects(controller.createBatch(batch([{ amount: 100 }], settlement(100)), { user: colleague, headers: {} }), error => error.getStatus() === 409);
      assert.equal((await client.query('select count(*)::int as n from temo.transacciones')).rows[0].n, before);
      const own = await controller.list('200', '0', { user: colleague });
      assert.ok(!own.some(row => row.database_id === deposit.transactions[0].id));
      const shared = await transactions.createBatch(batch([{ amount: 100, pendingName: 'Scope pending' }, { amount: 60, pendingName: 'Scope pending' }], settlement(0)), {});
      await transactions.groupDetail(shared.transactions[0].id, colleague);
      const pending = (await transactions.listPending(colleague)).find(row => row.transaction_database_id === shared.transactions[0].id);
      assert.ok(pending);
      const otherBranch = (await client.query("select id_sucursal as id from temo.sucursales where id_sucursal<>$1 and estado='ACTIVO' limit 1", [branch.id])).rows[0];
      assert.ok(otherBranch, 'preview requires two active branches for scope tests');
      const foreign = await createCoworker(otherBranch.id, 'foreign');
      await assert.rejects(controller.exportRows({ format: 'PDF', ids: [shared.transactions[0].id] }, { user: foreign }), error => error.getStatus() === 403);
      await assert.rejects(transactions.detail(shared.transactions[0].id, foreign), error => error.getStatus() === 403);
      await assert.rejects(transactions.pendingPaymentDetail(pending.database_id, foreign), error => error.getStatus() === 403);
      assert.ok(!(await transactions.listPending(foreign)).some(row => row.database_id === pending.database_id));
      await transactions.detail(deposit.transactions[0].id, admin);
      await transactions.updateGroup(shared.transactions[0].id, { updates: [], voidIds: shared.transactions.map(row => row.id), preferential: false }, cashier);
    });
    await t.test('Another cashier cannot read or void this transaction', async () => {
      const outsider = { id: admin.id, roleCode: 'CAJERO' };
      await assert.rejects(transactions.detail(deposit.transactions[0].id, outsider), (error) => [403, 404].includes(error.getStatus()));
      await assert.rejects(shifts.detail(shiftId, outsider), (error) => [403,404].includes(error.getStatus()));
      const context = await transfers.context(cashier);
      assert.deepEqual(context.accounts, []);
      assert.ok(context.shifts.every(row=>row.id===shiftId));
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
    await t.test('USD pending paid with NIO exposes spread once; detail and reversal preserve cash', async () => {
      const group = await transactions.createBatch(batch([{ amount: 84, currencyCode: 'USD', pendingName: 'USD REGRESSION' }], settlement()), {});
      const pending = (await client.query('select id_pendiente as id from temo.pagos_pendientes where id_transaccion=$1', [group.transactions[0].id])).rows[0];
      const before = await summary();
      const cash = settlement();
      cash.primaryRateKind = 'VENTA';
      cash.primaryCounts.NIO = [{denomination:500,piles25:0,loose:6},{denomination:100,piles25:0,loose:1},{denomination:5,piles25:0,loose:1},{denomination:1,piles25:0,loose:3}];
      await transactions.payPendingBatch(payPendingBatchSchema.parse({pendingIds:[pending.id],method:'EFECTIVO',rates,settlement:cash}), cashier);
      near((await summary()).expectedCash.NIO, before.expectedCash.NIO + 3057.6);
      const payment = (await client.query('select id_abono from temo.abonos_pendientes where id_pendiente=$1',[pending.id])).rows[0];
      const purchase = (await purchases.list(cashier)).find(row => row.database_id === payment.id_abono);
      assert.ok(purchase); near(purchase.monto_comprado_usd,84); near(purchase.diferencia_nio,50.4);
      const detail = await transactions.pendingPaymentDetail(pending.id, cashier);
      near(detail.compensations[0].tasa_venta_usada,37);
      assert.equal(detail.cash.length,4);
      await assert.rejects(purchases.list({id:cashier.id,roleCode:'TRANSFERISTA'}), error=>error.getStatus()===403);
      await transactions.reopenPaymentBatch(pending.id,detail.compensations.map(row=>row.id_abono),cashier);
      near((await summary()).expectedCash.NIO,before.expectedCash.NIO);
      assert.ok(!(await purchases.list(cashier)).some(row=>row.database_id===payment.id_abono));
    });
    await t.test('Shared USD cash payment allocates USD coverage once across two pendings', async () => {
      const ids=[];
      for (const amount of [84,16]) {
        const g=await transactions.createBatch(batch([{amount,currencyCode:'USD',pendingName:'USD SHARED'}],settlement()),{});
        ids.push((await client.query('select id_pendiente as id from temo.pagos_pendientes where id_transaccion=$1',[g.transactions[0].id])).rows[0].id);
      }
      const before=await summary();
      const cash=settlement(); cash.primaryRateKind='VENTA';
      cash.primaryCounts={NIO:[{denomination:500,piles25:0,loose:3},{denomination:100,piles25:0,loose:3},{denomination:50,piles25:0,loose:1}],USD:[{denomination:50,piles25:0,loose:1}]};
      await transactions.payPendingBatch(payPendingBatchSchema.parse({pendingIds:ids,method:'EFECTIVO',rates,settlement:cash}),cashier);
      near((await summary()).expectedCash.NIO,before.expectedCash.NIO+3640);
      const detail=await transactions.pendingPaymentDetail(ids[0],cashier);
      const paymentIds=new Set(detail.compensations.map(row=>row.id_abono));
      const rows=(await purchases.list(cashier)).filter(row=>paymentIds.has(row.database_id));
      near(rows.reduce((sum,row)=>sum+Number(row.monto_comprado_usd),0),50);
      near(rows.reduce((sum,row)=>sum+Number(row.diferencia_nio),0),30);
      await transactions.reopenPaymentBatch(ids[0],[...paymentIds],cashier);
      near((await summary()).expectedCash.NIO,before.expectedCash.NIO);
    });
    await t.test('Legacy single USD payment with USD cash is not a dollar purchase', async () => {
      const g=await transactions.createBatch(batch([{amount:84,currencyCode:'USD',pendingName:'USD LEGACY'}],settlement()),{});
      const id=(await client.query('select id_pendiente as id from temo.pagos_pendientes where id_transaccion=$1',[g.transactions[0].id])).rows[0].id;
      const before=await summary();
      const cash=settlement();
      cash.primaryCounts.USD=[{denomination:50,piles25:0,loose:1},{denomination:20,piles25:0,loose:1},{denomination:10,piles25:0,loose:1},{denomination:1,piles25:0,loose:4}];
      await transactions.payPending(id,{rates,settlement:cash},cashier);
      near((await summary()).expectedCash.NIO,before.expectedCash.NIO+3057.6);
      const detail=await transactions.pendingPaymentDetail(id,cashier);
      assert.equal(detail.compensations.length,1); assert.equal(detail.cash.length,4);
      assert.ok(!(await purchases.list(cashier)).some(row=>row.database_id===detail.compensations[0].id_abono));
      await transactions.reopenPaymentBatch(id,detail.compensations.map(row=>row.id_abono),cashier);
      near((await summary()).expectedCash.NIO,before.expectedCash.NIO);
    });
    await t.test('Mixed pending payment excludes its digital portion from cash and purchases', async () => {
      const g=await transactions.createBatch(batch([{amount:100,currencyCode:'USD',pendingName:'USD MIXED'}],settlement()),{});
      const id=(await client.query('select id_pendiente as id from temo.pagos_pendientes where id_transaccion=$1',[g.transactions[0].id])).rows[0].id;
      const before=await summary();
      const cash=settlement();cash.primaryRateKind='VENTA';
      cash.primaryCounts.NIO=[{denomination:500,piles25:0,loose:3},{denomination:100,piles25:0,loose:3},{denomination:50,piles25:0,loose:1}];
      await transactions.payPendingBatch(payPendingBatchSchema.parse({pendingIds:[id],method:'MIXTO',rates,settlement:cash,digital:{entityCode:'BAC',movementCode:'RE',amount:50}}),cashier);
      near((await summary()).expectedCash.NIO,before.expectedCash.NIO+1820);
      const detail=await transactions.pendingPaymentDetail(id,cashier);
      assert.equal(detail.details.length,2);
      const ids=new Set(detail.compensations.map(row=>row.id_abono));
      const purchasesForPayment=(await purchases.list(cashier)).filter(row=>ids.has(row.database_id)||detail.compensations.some(payment=>payment.id_transaccion===row.database_id));
      assert.equal(purchasesForPayment.length,1);
      near(purchasesForPayment[0].monto_comprado_usd,50); near(purchasesForPayment[0].diferencia_nio,30);
      await transactions.reopenPaymentBatch(id,[...ids],cashier);
      near((await summary()).expectedCash.NIO,before.expectedCash.NIO);
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
