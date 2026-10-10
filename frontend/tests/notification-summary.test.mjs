import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTransferNotifications } from '../src/utils/notification-summary.ts';

const item = overrides => ({ kind: 'TRANSFER_RECORDED', branch: 'Olivera', cashier: 'Cristina',
  amount: '100', currency: 'NIO', transfer_type: 'EFECTIVO', transfer_direction: 'ENTRA', transfer_entity: null, ...overrides });

test('summary separates branches, directions, cashiers and currencies while counting transfers', () => {
  const rows = [item({}), item({ amount: '50' }), item({ currency: 'USD', amount: '20' }),
    item({ cashier: 'Ana' }), item({ transfer_direction: 'SALE' }), item({ branch: 'Metrocentro' }),
    item({ kind: 'CLOSE_REQUEST' })];
  const summary = summarizeTransferNotifications(rows);
  assert.equal(summary.length, 2);
  const first = summary[0];
  assert.equal(first.branch, 'Olivera');
  assert.deepEqual(first.directions.map(d => [d.out, d.count]), [[false, 4], [true, 1]]);
  assert.deepEqual(first.directions[0].rows, [
    { cashier: 'Cristina', bank: '', currency: 'NIO', amount: 150, count: 2 },
    { cashier: 'Cristina', bank: '', currency: 'USD', amount: 20, count: 1 },
    { cashier: 'Ana', bank: '', currency: 'NIO', amount: 100, count: 1 },
  ]);
  assert.equal(summary[1].directions[0].count, 1);
  assert.equal(rows[0].amount, '100');
});

test('digital banks remain distinct within cashier, branch and direction', () => {
  const summary = summarizeTransferNotifications([
    item({ transfer_type: 'CUENTA_BANCARIA', transfer_entity: 'BAC' }),
    item({ transfer_type: 'CUENTA_BANCARIA', transfer_entity: 'LAFISE', amount: '20' }),
    item({ transfer_type: 'CUENTA_BANCARIA', transfer_entity: 'BAC', amount: '30' }),
  ]);
  assert.deepEqual(summary[0].directions[0].rows.map(r => [r.bank, r.amount, r.count]),
    [['BAC', 130, 2], ['LAFISE', 20, 1]]);
});

test('empty summaries and missing labels do not drop transfer notifications', () => {
  assert.deepEqual(summarizeTransferNotifications([]), []);
  const summary = summarizeTransferNotifications([item({ branch: '', cashier: '', transfer_type: 'CUENTA_BANCARIA' })]);
  assert.equal(summary[0].branch, 'Sucursal no disponible');
  assert.equal(summary[0].directions[0].rows[0].cashier, 'Cajero no disponible');
  assert.equal(summary[0].directions[0].rows[0].bank, 'Banco no disponible');
});
