const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { requireSessionVersion } = require('../dist/common/session-version');
const { financialRequest, validateFinancialActor } = require('../dist/common/financial-request');
const { DirectoryService } = require('../dist/modules/directory/directory.service');
const { ShiftsService } = require('../dist/modules/shifts/shifts.service');
const { HandoversService } = require('../dist/modules/shifts/handovers.service');
const invalid = [undefined, null, '', '1', true, [], {}, -1, 0.5, NaN, Infinity, 2147483648];
const forbidden = error => error.getStatus?.() === 403;
const actor = { id: randomUUID(), roleCode: 'CAJERO', sessionVersion: 1 };
const noSQL = { query: () => assert.fail('invalid identity reached SQL') };

test('session version accepts only the PostgreSQL integer domain without coercion', () => {
  for (const value of invalid) assert.throws(() => requireSessionVersion(value), forbidden);
  for (const value of [0, 1, 2147483647]) assert.equal(requireSessionVersion(value), value);
});

test('every financial receipt operation rejects invalid identity before lookup, work or replay', async () => {
  const operations = ['CREAR_TRANSACCIONES', 'CREAR_TRANSFERENCIA', 'LIQUIDAR_PENDIENTE', 'LIQUIDAR_PENDIENTES',
    'EDITAR_TRANSACCION', 'ANULAR_TRANSACCION', 'EDITAR_GRUPO', 'EDITAR_TRANSFERENCIA', 'ANULAR_TRANSFERENCIA'];
  for (const operation of operations) for (const sessionVersion of invalid) {
    await assert.rejects(financialRequest(noSQL, { actor: { ...actor, sessionVersion }, operation,
      requestId: randomUUID(), payload: {}, roles: ['CAJERO'] },
    () => assert.fail('work must not run'), () => assert.fail('receipt must not be returned')), forbidden);
  }
});

test('valid financial identity uses exact version and locks; database denial prevents work', async () => {
  for (const roleCode of ['JEFA', 'CAJERO', 'TRANSFERISTA']) {
    for (const sessionVersion of [0, 2147483647]) {
      let calls = 0;
      await validateFinancialActor({ query: async (sql, args) => {
        calls++; assert.deepEqual(args, [actor.id, roleCode, sessionVersion]);
        assert.match(sql, /u\.version_sesion=\$3/); assert.match(sql, /for share of u,r/);
        assert.ok(!sql.includes('is null or')); return { rowCount: 1 };
      } }, { ...actor, roleCode, sessionVersion }, [roleCode]);
      assert.equal(calls, 1);
    }
  }
  await assert.rejects(financialRequest({ query: async () => ({ rowCount: 0 }) }, {
    actor, operation: 'CREAR_TRANSACCIONES', payload: {}, roles: ['CAJERO'] },
  () => assert.fail('database denied actor'), () => assert.fail('database denied replay')), forbidden);
  await assert.rejects(validateFinancialActor(noSQL, { ...actor, mustChangePassword: true }, ['CAJERO']), forbidden);
  await assert.rejects(validateFinancialActor(noSQL, { ...actor, roleCode: 'CUSTOM' }, ['CAJERO']), forbidden);
});

test('both directory writes require a session version before touching parent or children', async () => {
  const service = new DirectoryService({ transaction: work => work(noSQL) });
  for (const roleCode of ['JEFA', 'CAJERO']) for (const sessionVersion of invalid) {
    const user = { ...actor, roleCode, sessionVersion };
    await assert.rejects(service.create({}, user), forbidden);
    await assert.rejects(service.update(randomUUID(), {}, user), forbidden);
  }
});

test('shift creation, opening and corrections enforce identity at the write boundary', async () => {
  const client = { query: (sql, args) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({ rows: [] }) : noSQL.query(sql, args) };
  const db = { transaction: work => work(client), query: async () => ({ rowCount: 0 }) };
  const service = new ShiftsService(db);
  const id = randomUUID();
  for (const sessionVersion of invalid) {
    const admin = { ...actor, roleCode: 'JEFA', sessionVersion };
    const cashier = { ...actor, sessionVersion };
    await assert.rejects(service.create({}, admin), forbidden);
    await assert.rejects(service.openPrepared(id, cashier), forbidden);
    service.findAuthorizedShift = async () => ({ estado: 'ABIERTO' });
    await assert.rejects(service.update(id, {}, admin), forbidden);
    service.findAuthorizedShift = async () => ({ estado: 'CERRADO' });
    await assert.rejects(service.updateClosed(id, {}, admin), forbidden);
    await assert.rejects(service.saveCashCount(id, {}, cashier), forbidden);
    await assert.rejects(service.saveBalances(id, [], cashier), forbidden);
    await assert.rejects(service.requestClose(id, cashier), forbidden);
    await assert.rejects(service.cancelClose(id, cashier), forbidden);
    await assert.rejects(service.close(id, {}, admin), forbidden);
    await assert.rejects(service.rejectClose(id, admin), forbidden);
  }
});

test('handover identity cannot coerce versions or bypass mandatory password change', async () => {
  const service = new HandoversService({}, {});
  for (const user of [...invalid.map(sessionVersion => ({ ...actor, sessionVersion })), { ...actor, mustChangePassword: true }]) {
    await assert.rejects(service.actor(noSQL, user), forbidden);
    await assert.rejects(service.preview(randomUUID(), user), forbidden);
    await assert.rejects(service.propose(randomUUID(), {}, user), forbidden);
    await assert.rejects(service.registerDifference(randomUUID(), '', user), forbidden);
    for (const action of ['accept', 'reject', 'cancel']) await assert.rejects(service.resolve(randomUUID(), action, user), forbidden);
  }
});
