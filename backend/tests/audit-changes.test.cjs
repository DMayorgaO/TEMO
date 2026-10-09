const test = require('node:test');
const assert = require('node:assert/strict');
const { auditChanges } = require('../dist/modules/catalogs/audit-changes');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');

test('audit changes only exposes approved scalars and distinguishes missing from null', () => {
  const result = auditChanges('pagos_pendientes', { estado: 'PENDIENTE', password: 'secret' }, { estado: 'PAGADO', saldo_pendiente: null, token: 'secret', monto_original: { token: 'secret' } });
  assert.deepEqual(result.changes, [
    { field: 'Estado', before: 'PENDIENTE', after: 'PAGADO' },
    { field: 'Saldo pendiente', before: 'No registrado', after: 'Sin valor' },
  ]);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.deepEqual(auditChanges('unknown', { password: 'secret' }, { password: 'secret2' }).changes, []);
  assert.equal(auditChanges('transacciones', null, { amount: 100 }).hasBefore, false);
  assert.deepEqual(auditChanges('transacciones', { amount: 100 }, { amount: 100 }).changes, []);
});

test('audit detail denies non-admin before querying and binds the identifier', async () => {
  const calls = [];
  const controller = new CatalogsController({ query: async (...args) => { calls.push(args); return { rows: [{ tabla: 'usuarios', datos_nuevos: { evento: 'MFA_VERIFICADO', secret: 'hidden' }, datos_anteriores: null }] }; } }, {});
  for (const roleCode of ['CAJERO', 'TRANSFERISTA', 'OTHER']) {
    await assert.rejects(controller.auditDetail('id', { user: { roleCode } }), error => error.getStatus() === 403);
  }
  assert.equal(calls.length, 0);
  const result = await controller.auditDetail('id', { user: { roleCode: 'JEFA' } });
  assert.deepEqual(calls[0][1], ['id']);
  assert.ok(!JSON.stringify(result).includes('hidden'));
  const absent = new CatalogsController({ query: async () => ({ rows: [] }) }, {});
  await assert.rejects(absent.auditDetail('id', { user: { roleCode: 'JEFA' } }), error => error.getStatus() === 404);
});

test('rates compares only explicitly allowed nested paths', () => {
  const result = auditChanges('transacciones', { rates: { buy: 36.4, sell: 37, secret: 'hidden' } }, { rates: { buy: 36.55, sell: 37, secret: 'exposed' } });
  assert.deepEqual(result.changes, [{ field: 'Tasa de compra', before: '36.4', after: '36.55' }]);
  assert.ok(!JSON.stringify(result).includes('hidden'));
});

test('cash comparison groups denominations, converts x25, and treats absent data as unknown', () => {
  const snapshot = rows => ({ settlement: { primaryCounts: { NIO: rows, USD: [] }, changeCounts: { NIO: [], USD: [] } } });
  const old = snapshot([{ denomination: 100, piles25: 1, loose: 0, token: 'secret' }]);
  const equivalent = snapshot([{ denomination: 100, piles25: 0, loose: 20 }, { denomination: 100, piles25: 0, loose: 5 }]);
  assert.deepEqual(auditChanges('transacciones', old, equivalent).changes, []);
  const next = snapshot([{ denomination: 100, piles25: 0, loose: 24 }]);
  assert.deepEqual(auditChanges('transacciones', old, next).changes, [{ field: 'Efectivo principal C$ 100', before: '25 unidades', after: '24 unidades' }]);
  assert.equal(auditChanges('transacciones', null, next).changes[0].before, 'No registrado');
  assert.equal(auditChanges('transacciones', old, snapshot([])).changes[0].after, '0 unidades');
  assert.equal(auditChanges('transacciones', old, snapshot([{ denomination: 100, piles25: -1, loose: 0 }])).changes[0].after, 'No registrado');
  assert.ok(!JSON.stringify(auditChanges('transacciones', old, next)).includes('secret'));
});

test('group comparison pairs UUIDs, not array positions, and filters nested secrets', () => {
  const a = { id: '00000000-0000-4000-8000-000000000001', order: 1, amount: 100, estado: 'REGISTRADA' };
  const b = { id: '00000000-0000-4000-8000-000000000002', order: 2, amount: 60, estado: 'REGISTRADA' };
  assert.deepEqual(auditChanges('grupos_transacciones', { auditTransactions: [a, b] }, { auditTransactions: [b, a] }).changes, []);
  const result = auditChanges('grupos_transacciones', { auditTransactions: [a, b] }, { auditTransactions: [{ ...b, estado: 'ANULADA', password: 'hidden' }, { ...a, amount: 120 }] });
  assert.equal(result.changes.length, 2);
  assert.ok(result.changes.some(row => row.field.includes('Pestana 1') && row.before === '100' && row.after === '120'));
  assert.ok(result.changes.some(row => row.field.includes('Pestana 2') && row.after === 'ANULADA'));
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.deepEqual(auditChanges('grupos_transacciones', {}, { auditTransactions: [{ id: 'bad', amount: 1 }] }).changes, []);
});

test('historical corrections expose approved differences, never stored raw payloads', () => {
  const result = auditChanges('correcciones_transacciones_cerradas',
    { auditTransaction: { amount: 100, estado: 'REGISTRADA', token: 'hidden' } },
    { auditTransaction: { amount: 120, estado: 'ANULADA', token: 'secret' }, cierrePreservado: true });
  assert.ok(result.changes.some(row => row.field === 'Monto' && row.before === '100' && row.after === '120'));
  assert.ok(result.changes.some(row => row.field === 'Estado' && row.after === 'ANULADA'));
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.ok(!JSON.stringify(result).includes('secret'));
});
