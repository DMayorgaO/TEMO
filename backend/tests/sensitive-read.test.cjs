const test = require('node:test');
const assert = require('node:assert/strict');
const { of, throwError, lastValueFrom } = require('rxjs');
const { SensitiveReadInterceptor } = require('../dist/common/errors/sensitive-read.interceptor');
const actor = '00000000-0000-4000-8000-000000000001';
const target = '00000000-0000-4000-8000-000000000002';
const host = request => ({ switchToHttp: () => ({ getRequest: () => request }) });

test('successful sensitive read audits actor and record without response data or credentials', async () => {
  const calls = [];
  const interceptor = new SensitiveReadInterceptor({ query: async (...args) => calls.push(args) });
  const request = { method: 'GET', user: { id: actor }, route: { path: '/api/transactions/:id/detail' }, params: { id: target }, ip: '127.0.0.1',
    originalUrl: '/api/transactions/id/detail?token=hidden', headers: { authorization: 'hidden' } };
  const response = { records: [{ private: 'hidden' }] };
  assert.equal(await lastValueFrom(interceptor.intercept(host(request), { handle: () => of(response) })), response);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], [actor, 'GET', '/api/transactions/:id/detail', '127.0.0.1', 'LECTURA_SENSIBLE', target, 'CONSULTAR']);
  assert.ok(!JSON.stringify(calls).includes('hidden'));
  await lastValueFrom(interceptor.intercept(host(request), { handle: () => of(response) }));
  assert.equal(calls.length, 1);
  request.params.id = '00000000-0000-4000-8000-000000000003';
  await lastValueFrom(interceptor.intercept(host(request), { handle: () => of(response) }));
  assert.equal(calls.length, 2);
});

test('public, polling notifications, writes and failed reads do not produce success audit', async () => {
  const calls = [];
  const interceptor = new SensitiveReadInterceptor({ query: async (...args) => calls.push(args) });
  for (const request of [
    { method: 'GET', route: { path: '/api/catalogs/usuarios' } },
    { method: 'GET', user: { id: actor }, route: { path: '/api/shifts/notifications' } },
    { method: 'POST', user: { id: actor }, route: { path: '/api/transactions' } },
  ]) await lastValueFrom(interceptor.intercept(host(request), { handle: () => of([]) }));
  await assert.rejects(lastValueFrom(interceptor.intercept(host({ method: 'GET', user: { id: actor }, route: { path: '/api/catalogs/usuarios' } }),
    { handle: () => throwError(() => new Error('denied')) })));
  assert.equal(calls.length, 0);
});
