const test = require('node:test');
const assert = require('node:assert/strict');
const { of, Subject, lastValueFrom, throwError } = require('rxjs');
const { parseExportSelection, authorizedExport } = require('../dist/common/export-selection');
const { ExportLimitInterceptor } = require('../dist/common/export-limit.interceptor');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');
const { TransactionsController } = require('../dist/modules/transactions/transactions.controller');
const { ShiftsService } = require('../dist/modules/shifts/shifts.service');
const { ShiftsController } = require('../dist/modules/shifts/shifts.controller');
const actor = '00000000-0000-4000-8000-000000000001';
const first = '00000000-0000-4000-8000-000000000002';
const second = '00000000-0000-4000-8000-000000000003';
const request = { user: { id: actor, roleCode: 'JEFA' }, ip: '::ffff:127.0.0.1' };

test('export selection rejects forged identities, SQL, duplicate IDs and oversized requests', () => {
  for (const body of [{ format: 'EXCEL', ids: ["' or 1=1"] }, { format: 'PDF', ids: [first, first] },
    { format: 'EXCEL', ids: [], userId: actor }, { format: 'CSV', ids: [] },
    { format: 'EXCEL', ids: Array(5001).fill(first) }, { format: 'PDF', ids: [], rows: [{ password: 'hidden' }] }]) {
    assert.throws(() => parseExportSelection(body), error => error.getStatus() === 400);
  }
  assert.deepEqual(parseExportSelection({ format: 'PDF', ids: [] }), { format: 'PDF', ids: [] });
});

test('authorized dataset preserves selected order, records verified count, fails closed', async () => {
  const calls = [];
  const db = { query: async (...args) => calls.push(args) };
  const rows = [{ id: first, name: '=1+1' }, { id: second, name: 'private' }];
  assert.deepEqual(await authorizedExport(db, request, 'Usuarios', { format: 'EXCEL', ids: [second, first] }, rows, r => r.id), [rows[1], rows[0]]);
  assert.deepEqual(calls[0][1], [actor, 'EXCEL', 'Usuarios', 2, '127.0.0.1']);
  assert.ok(!JSON.stringify(calls).includes('private'));
  await assert.rejects(authorizedExport(db, request, 'Usuarios', { format: 'PDF', ids: [actor] }, rows, r => r.id), e => e.getStatus() === 403);
  assert.equal(calls.length, 1);
  await assert.rejects(authorizedExport({ query: async () => { throw new Error('database unavailable'); } }, request,
    'Usuarios', { format: 'PDF', ids: [first] }, rows, r => r.id), /database unavailable/);
});

test('catalog export denies cashier, unsupported resources and uses allowlisted fresh data', async () => {
  const calls = [];
  const controller = new CatalogsController({ query: async (...args) => { calls.push(args); return { rows: [{ id: first, usuario: 'fresh' }] }; } }, {});
  const body = { format: 'EXCEL', ids: [first] };
  await assert.rejects(controller.exportRows('users', body, { user: { id: actor, roleCode: 'CAJERO' } }), e => e.getStatus() === 403);
  for (const resource of ['__proto__', 'constructor', 'tokens', 'reports']) {
    await assert.rejects(controller.exportRows(resource, body, request), e => e.getStatus() === 400);
  }
  assert.equal(calls.length, 0);
  const result = await controller.exportRows('users', body, request);
  assert.equal(result[0].usuario, 'fresh');
  assert.doesNotMatch(calls[0][0], /contrasena|mfa|select\s+\*/i);
  assert.match(calls[1][0], /EXPORTACION_AUTORIZADA/);
});

test('transaction and shift exports bind scope and identifiers in SQL', async () => {
  const calls = [];
  const db = { query: async (...args) => { calls.push(args); return { rows: [{ database_id: first }] }; } };
  const cashier = { user: { id: actor, roleCode: 'CAJERO' } };
  const transactions = new TransactionsController(db, { applyHistoricalRows: async rows => rows });
  await transactions.exportRows({ format: 'PDF', ids: [first] }, cashier);
  assert.deepEqual(calls[0][1], [1, 0, 'CAJERO', actor, [first]]);
  assert.match(calls[0][0], /t.id_cajero = \$4::uuid/);
  assert.match(calls[0][0], /tu.estado in \('ABIERTO', 'PENDIENTE_APROBACION'\)/);
  assert.match(calls[0][0], /t.id_transaccion = any\(\$5::uuid\[\]\)/);
  const shifts = new ShiftsService(db);
  await shifts.exportRows({ format: 'EXCEL', ids: [first] }, cashier);
  assert.deepEqual(calls[2][1], ['CAJERO', actor, [first]]);
  assert.match(calls[2][0], /t.id_cajero = \$2/);
  for (const roleCode of ['TRANSFERISTA', 'OTHER']) {
    await assert.rejects(transactions.exportRows({ format: 'PDF', ids: [] }, { user: { id: actor, roleCode } }), e => e.getStatus() === 403);
    await assert.rejects(shifts.exportRows({ format: 'PDF', ids: [] }, { user: { id: actor, roleCode } }), e => e.getStatus() === 403);
  }
  assert.equal(calls.length, 4);
});

test('PNG export validates dates and role, counts server data, not client claims', async () => {
  const controller = new ShiftsController({ exportDashboard: async () => 'ok' });
  for (const body of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-01-01' },
    { from: '2026-02-01', to: '2026-01-01' }, { from: '2024-01-01', to: '2026-01-01' }, { rows: 999 }]) {
    assert.throws(() => controller.exportDashboard(body, request), e => e.getStatus() === 400);
  }
  const calls = [];
  const service = new ShiftsService({ query: async (...args) => calls.push(args) });
  service.dashboard = async () => ({ counts: [{ day: '2026-10-08' }, { day: '2026-10-08' }] });
  await assert.rejects(service.exportDashboard({ user: { id: actor, roleCode: 'CAJERO' } }), e => e.getStatus() === 403);
  await service.exportDashboard(request);
  assert.deepEqual(calls[0][1], [actor, 'PNG', 'Grafica de transacciones', 2, '127.0.0.1']);
});

const host = req => ({ switchToHttp: () => ({ getRequest: () => req }) });
test('export abuse protection isolates users and leaves financial operations unaffected', async () => {
  const limiter = new ExportLimitInterceptor();
  const req = { method: 'POST', user: { id: actor }, route: { path: '/api/transactions/export' } };
  for (let i = 0; i < 30; i++) await lastValueFrom(limiter.intercept(host(req), { handle: () => of([]) }));
  assert.throws(() => limiter.intercept(host(req), { handle: () => of([]) }), e => e.getStatus() === 429);
  await lastValueFrom(limiter.intercept(host({ ...req, user: { id: second } }), { handle: () => of([]) }));
  await lastValueFrom(limiter.intercept(host({ ...req, route: { path: '/api/transactions/batch' } }), { handle: () => of([]) }));
});

test('export concurrency slots are released on errors and completion', async () => {
  const limiter = new ExportLimitInterceptor();
  const context = host({ method: 'POST', user: { id: actor }, route: { path: '/api/shifts/export' } });
  const source = new Subject();
  const a = limiter.intercept(context, { handle: () => source }).subscribe();
  const b = limiter.intercept(context, { handle: () => source }).subscribe();
  assert.throws(() => limiter.intercept(context, { handle: () => of([]) }), e => e.getStatus() === 429);
  a.unsubscribe(); b.unsubscribe();
  await assert.rejects(lastValueFrom(limiter.intercept(context, { handle: () => throwError(() => new Error('failed')) })), /failed/);
  await lastValueFrom(limiter.intercept(context, { handle: () => of([]) }));
});

test('preview: server exports match scoped reads, reject foreign IDs, never include secrets', { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview' });
  await client.connect();
  try {
    await client.query('begin');
    const admin = (await client.query("select u.id_usuario as id from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='JEFA' limit 1")).rows[0];
    const cashier = (await client.query("select u.id_usuario as id from temo.usuarios u join temo.roles r using(id_rol) where r.codigo='CAJERO' limit 1")).rows[0];
    const catalog = new CatalogsController(client, {});
    const context = { user: { ...admin, roleCode: 'JEFA' } };
    const users = await catalog.exportRows('users', { format: 'EXCEL', ids: [admin.id] }, context);
    assert.equal(users.length, 1);
    assert.ok(!Object.keys(users[0]).some(k => /password|contrasena|mfa|token|secret/i.test(k)));
    const service = new ShiftsService(client);
    const transactionService = { applyHistoricalRows: async rows => rows };
    const transactions = new TransactionsController(client, transactionService);
    const cashierContext = { user: { ...cashier, roleCode: 'CAJERO' } };
    await assert.rejects(transactions.exportRows({ format: 'PDF', ids: [admin.id] }, cashierContext), e => e.getStatus() === 403);
    await assert.rejects(service.exportRows({ format: 'PDF', ids: [admin.id] }, cashierContext), e => e.getStatus() === 403);
    const own = await transactions.list('200', '0', cashierContext);
    const exported = await transactions.exportRows({ format: 'PDF', ids: own.map(r => r.database_id) }, cashierContext);
    assert.deepEqual(exported, own);
    const event = (await client.query("select datos_nuevos from temo.bitacora where id_usuario=$1 and datos_nuevos->>'evento'='EXPORTACION_AUTORIZADA' order by fecha_creacion desc limit 1", [cashier.id])).rows[0];
    assert.equal(event.datos_nuevos.filas_verificadas, own.length);
  } finally { await client.query('rollback'); await client.end(); }
});
