const test = require('node:test');
const assert = require('node:assert/strict');
const { ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { DeniedAccessAudit } = require('../dist/common/errors/denied-access-audit');
const { AppExceptionFilter } = require('../dist/common/errors/app-exception.filter');
const id = '00000000-0000-4000-8000-000000000001';

test('denial audit binds parameters, normalizes IP and deduplicates repeated operations', async () => {
  const calls = [];
  const audit = new DeniedAccessAudit({ query: async (...args) => calls.push(args) });
  await audit.record(id, 'GET', '/api/catalogs/usuarios', '::ffff:127.0.0.1');
  await audit.record(id, 'GET', '/api/catalogs/usuarios', '127.0.0.1');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], [id, 'GET', '/api/catalogs/usuarios', '127.0.0.1', 'ACCESO_DENEGADO', null, 'RECHAZAR']);
  await audit.record(id, 'POST', '/api/catalogs/usuarios', 'invalid');
  assert.equal(calls[1][1][3], null);
  await audit.record('bad', 'GET', '/x', '');
  assert.equal(calls.length, 2);
});

test('filter records authenticated 403 without body, query, token or exception details', async () => {
  const calls = [];
  const logs = [];
  const filter = new AppExceptionFilter({ query: async (...args) => calls.push(args) });
  filter.logger = { error: value => logs.push(value), warn: value => logs.push(value) };
  let status;
  const response = { status: value => { status = value; return response; }, json: () => {} };
  const request = { user: { id }, method: 'GET', ip: '127.0.0.1', route: { path: '/api/catalogs/:resource' },
    baseUrl: '', originalUrl: '/api/catalogs/private?token=hidden', headers: { authorization: 'Bearer hidden' }, body: { password: 'hidden' } };
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) };
  filter.catch(new ForbiddenException('hidden exception'), host);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status, 403);
  assert.equal(calls.length, 1);
  assert.ok(!JSON.stringify({ calls, logs }).includes('hidden'));
  delete request.user;
  filter.catch(new UnauthorizedException(), host);
  assert.equal(status, 401);
  assert.equal(calls.length, 1);
});

test('audit persistence failure never changes denial response or logs database secrets', async () => {
  const filter = new AppExceptionFilter({ query: async () => { throw new Error('database-password'); } });
  const logs = [];
  filter.logger = { error: value => logs.push(value), warn: value => logs.push(value) };
  let status;
  const response = { status: value => { status = value; return response; }, json: () => {} };
  filter.catch(new ForbiddenException(), { switchToHttp: () => ({ getRequest: () => ({ user: { id }, method: 'GET', route: { path: '/api/private' }, ip: '' }), getResponse: () => response }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status, 403);
  assert.ok(logs.some(value => value.includes('persistir')));
  assert.ok(!JSON.stringify(logs).includes('database-password'));
});

test('denial recorder bounds concurrent writes', async () => {
  const releases = [];
  const audit = new DeniedAccessAudit({ query: () => new Promise(resolve => releases.push(resolve)) });
  const writes = Array.from({ length: 11 }, (_, index) => audit.record(id, 'GET', `/route-${index}`, ''));
  assert.equal(releases.length, 10);
  releases.forEach(resolve => resolve());
  await Promise.all(writes);
});
