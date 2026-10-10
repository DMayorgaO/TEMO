const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { RecordIdPipe } = require('../dist/common/record-id.pipe');
const { AuthGuard } = require('../dist/modules/auth/auth.guard');
const { Reflector, NestFactory } = require('@nestjs/core');
const { Module, RequestMethod, UnauthorizedException } = require('@nestjs/common');
const { PATH_METADATA, METHOD_METADATA } = require('@nestjs/common/constants');
const uuid = '8b6396e3-852f-49a9-bb28-7dc8be9481ab';

test('public endpoint allowlist includes only authentication recovery/MFA and health, never operational data', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { IS_PUBLIC_ENDPOINT } = require('../dist/modules/auth/public.decorator');
  const root = path.resolve(__dirname, '../dist/modules');
  const files = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.controller.js'));
  assert.equal(files.length, 8, 'review allowlist when adding controllers');
  const publicRoutes = [];
  const reflector = new Reflector();
  let validations = 0;
  const guard = new AuthGuard(reflector, { validateAccessToken: async () => { validations++; throw new Error('No token'); } });
  for (const file of files) {
    for (const controller of Object.values(require(path.join(root, file))).filter(value => typeof value === 'function')) {
      assert.notEqual(Reflect.getMetadata(IS_PUBLIC_ENDPOINT, controller), true, 'no entire controller is public');
      for (const key of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[key];
        if (typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
        const context = { getHandler: () => handler, getClass: () => controller,
          switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) };
        if (reflector.getAllAndOverride(IS_PUBLIC_ENDPOINT, [handler, controller])) {
          const route = Reflect.getMetadata(PATH_METADATA, handler);
          publicRoutes.push(`${RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)]} /api/${Reflect.getMetadata(PATH_METADATA, controller)}${route === '/' ? '' : '/' + route}`);
          assert.equal(await guard.canActivate(context), true);
        } else {
          await assert.rejects(guard.canActivate(context), e => e.getStatus() === 401);
        }
      }
    }
  }
  assert.deepEqual(publicRoutes.sort(), ['GET /api/health', 'POST /api/auth/login', 'POST /api/auth/mfa/verify',
    'POST /api/auth/password-recovery/confirm', 'POST /api/auth/password-recovery/request'].sort());
  assert.equal(validations, 0, 'missing headers and public endpoints do not query session data');
});

test('record IDs accept UUIDs without coercing or reflecting malformed inputs; other arguments are unchanged', async () => {
  const pipe = new RecordIdPipe();
  const metadata = { type: 'param', data: 'id' };
  // Syntax validation does not assert existence or ownership, including the nil UUID.
  for (const value of [uuid, uuid.toUpperCase(), '00000000-0000-0000-0000-000000000000']) {
    assert.equal(await pipe.transform(value, metadata), value);
  }
  for (const value of ['TRA-000001', '1', 'null', 'undefined', 'x'.repeat(300), "'; select private_data;--",
    ` ${uuid}`, `${uuid}\0`, null, {}, [uuid], 1]) {
    await assert.rejects(async () => pipe.transform(value, metadata), error =>
      error.getStatus() === 400 && error.message === 'El identificador del registro no es valido.');
  }
  const body = { id: 'untouched', amount: 10 };
  assert.equal(pipe.transform(body, { type: 'body' }), body);
  assert.equal(pipe.transform('50', { type: 'query', data: 'limit' }), '50');
  assert.equal(pipe.transform('roles', { type: 'param', data: 'resource' }), 'roles');
});

test('access guard confines password-change sessions and unsupported profiles to basic endpoints; revoked tokens fail', async () => {
  let user;
  let validations = 0;
  const guard = new AuthGuard(new Reflector(), { validateAccessToken: async () => {
    validations++;
    if (user === 'revoked') throw new UnauthorizedException('Revoked');
    return user;
  } });
  const context = (method, path, authorization = 'Bearer signed.token.value') => ({
    getHandler: () => function endpoint() {}, getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ method, route: { path }, headers: { authorization } }) }),
  });
  const basic = [['GET', '/api/auth/me'], ['POST', '/api/auth/logout'], ['POST', '/api/auth/change-password']];
  const operations = [['GET', '/api/transactions'], ['GET', '/api/shifts/current'], ['GET', '/api/directory'],
    ['POST', '/api/auth/profile-photo'], ['POST', '/api/shifts/export'], ['PUT', '/api/catalogs/usuarios/:id'],
    ['GET', '/api/auth/me/extra'], ['GET', '/api/auth/logout']];
  for (user of [{ roleCode: 'CAJERO', mustChangePassword: true }, { roleCode: 'JEFA', mustChangePassword: true },
    { roleCode: 'OTHER', mustChangePassword: false }]) {
    for (const [method, path] of basic) assert.equal(await guard.canActivate(context(method, path)), true);
    for (const [method, path] of operations) await assert.rejects(guard.canActivate(context(method, path)), e => e.getStatus() === 403);
  }
  for (const roleCode of ['JEFA', 'CAJERO', 'TRANSFERISTA']) {
    user = { roleCode, mustChangePassword: false };
    assert.equal(await guard.canActivate(context('GET', '/api/transactions')), true);
  }
  const before = validations;
  for (const header of ['', 'Basic credentials', 'Bearer a b', 'Bearer ' + 'a'.repeat(4097)]) {
    await assert.rejects(guard.canActivate(context('GET', '/api/transactions', header)), e => e.getStatus() === 401);
  }
  assert.equal(validations, before);
  user = 'revoked';
  for (const [method, path] of [...basic, ...operations]) {
    await assert.rejects(guard.canActivate(context(method, path)), e => e.getStatus() === 401);
  }
});

test('HTTP: every record route in four operational controllers rejects bad IDs before service work', async () => {
  const { TransactionsController } = require('../dist/modules/transactions/transactions.controller');
  const { TransactionsService } = require('../dist/modules/transactions/transactions.service');
  const { ShiftsController } = require('../dist/modules/shifts/shifts.controller');
  const { ShiftsService } = require('../dist/modules/shifts/shifts.service');
  const { TransfersController } = require('../dist/modules/transfers/transfers.controller');
  const { TransfersService } = require('../dist/modules/transfers/transfers.service');
  const { DirectoryController } = require('../dist/modules/directory/directory.controller');
  const { DirectoryService } = require('../dist/modules/directory/directory.service');
  const { DatabaseService } = require('../dist/modules/database/database.service');
  const controllers = [TransactionsController, ShiftsController, TransfersController, DirectoryController];
  const calls = [];
  const methods = ['detail', 'groupDetail', 'pendingPaymentDetail', 'acknowledgeNotification', 'openPrepared',
    'requestClose', 'void', 'reopenPendingPayment', 'update', 'updateGroup', 'payPending', 'reopenPaymentBatch',
    'updateClosed', 'saveCashCount', 'saveBalances', 'close'];
  const stub = Object.fromEntries(methods.map(method => [method, async (...args) => {
    calls.push({ method, args }); return { ok: true };
  }]));
  class BoundaryModule {}
  Module({ controllers, providers: [TransactionsService, ShiftsService, TransfersService, DirectoryService]
    .map(provide => ({ provide, useValue: stub })).concat([{ provide: DatabaseService, useValue: {
      query: async () => { throw new Error('Unexpected database access'); },
    } }]) })(BoundaryModule);
  const app = await NestFactory.create(BoundaryModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalGuards(new AuthGuard(new Reflector(), { validateAccessToken: async token => {
    if (token === 'revoked') throw new UnauthorizedException();
    return { id: uuid, roleCode: token === 'unknown' ? 'OTHER' : 'CAJERO', mustChangePassword: token === 'change' };
  } }));
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const routes = controllers.flatMap(controller => Object.getOwnPropertyNames(controller.prototype)
      .filter(key => key !== 'constructor' && typeof controller.prototype[key] === 'function')
      .map(key => controller.prototype[key]).filter(handler => String(Reflect.getMetadata(PATH_METADATA, handler)).includes(':id'))
      .map(handler => ({ path: `/api/${Reflect.getMetadata(PATH_METADATA, controller)}/${Reflect.getMetadata(PATH_METADATA, handler)}`,
        method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)] })));
    assert.equal(routes.length, 23, 'all existing record routes remain covered');
    for (const route of routes) {
      const request = (id, token) => fetch(base + route.path.replace(':id', encodeURIComponent(id)), {
        method: route.method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
        ...(route.method === 'GET' ? {} : { body: '{}' }), signal: AbortSignal.timeout(5000),
      });
      for (const id of ['invalid-private-marker', 'TRA-000001', "';select secret;--"]) {
        const response = await request(id, 'cashier');
        assert.equal(response.status, 400, `${route.method} ${route.path}`);
        const body = await response.json();
        assert.equal(body.message, 'El identificador del registro no es valido.');
        assert.ok(!JSON.stringify(body).includes(id));
      }
      for (const [token, status] of [[undefined, 401], ['revoked', 401], ['unknown', 403], ['change', 403]]) {
        assert.equal((await request(uuid, token)).status, status, route.path);
      }
    }
    assert.equal(calls.length, 0, 'no service called by rejected requests');
    let validCalls = 0;
    for (const route of routes) {
      const noBody = route.method === 'GET' || /\/(reopen|open-prepared|close-request|acknowledge)$/.test(route.path)
        || route.path === '/api/transactions/:id/void';
      const response = await fetch(base + route.path.replace(':id', uuid), {
        method: route.method, headers: { Authorization: 'Bearer cashier', 'Content-Type': 'application/json' },
        ...(route.method === 'GET' ? {} : { body: '{}' }), signal: AbortSignal.timeout(5000),
      });
      if (noBody) {
        assert.ok([200, 201].includes(response.status), route.path);
        assert.equal(calls.at(-1).args[0], uuid);
        validCalls++;
      } else {
        assert.equal(response.status, 400, route.path);
        assert.notEqual((await response.json()).message, 'El identificador del registro no es valido.');
      }
    }
    assert.equal(calls.length, validCalls);
  } finally { await app.close(); }
});
