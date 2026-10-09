const test = require('node:test');
const assert = require('node:assert/strict');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');
const id = '00000000-0000-4000-8000-000000000001';

test('export request trusts authenticated identity, validates metadata and groups duplicate clicks', async () => {
  const calls = [];
  const controller = new CatalogsController({ query: async (...args) => calls.push(args) }, {});
  const request = { user: { id, roleCode: 'JEFA' }, ip: '::ffff:127.0.0.1' };
  const body = { section: 'Usuarios', format: 'PDF', rows: 7 };
  assert.deepEqual(await controller.auditExport(body, request), { recorded: true });
  assert.deepEqual(calls[0][1], [id, 'PDF', 'Usuarios', 7, '127.0.0.1']);
  assert.deepEqual(await controller.auditExport(body, request), { recorded: false, grouped: true });
  assert.equal(calls.length, 1);
  for (const invalid of [{ ...body, userId: 'forged' }, { ...body, token: 'secret' }, { ...body, rows: -1 }, { ...body, rows: 1.5 }, { ...body, format: 'ZIP' }, { ...body, section: 'arbitrary' }]) {
    await assert.rejects(controller.auditExport(invalid, request), error => error.getStatus() === 400);
  }
  assert.equal(calls.length, 1);
});

test('export metadata enforces role and format without querying unauthorized data', async () => {
  const calls = [];
  const controller = new CatalogsController({ query: async (...args) => calls.push(args) }, {});
  for (const roleCode of ['CAJERO', 'TRANSFERISTA', 'OTHER']) {
    await assert.rejects(controller.auditExport({ section: 'Auditoria', format: 'EXCEL', rows: 1 }, { user: { id, roleCode } }), error => error.getStatus() === 403);
  }
  assert.equal(calls.length, 0);
  await controller.auditExport({ section: 'Transacciones', format: 'EXCEL', rows: 1 }, { user: { id, roleCode: 'CAJERO' } });
  await assert.rejects(controller.auditExport({ section: 'Grafica de transacciones', format: 'PDF', rows: 1 }, { user: { id, roleCode: 'JEFA' } }), error => error.getStatus() === 400);
  await controller.auditExport({ section: 'Grafica de transacciones', format: 'PNG', rows: 6 }, { user: { id, roleCode: 'JEFA' } });
  assert.equal(calls.length, 2);
});
