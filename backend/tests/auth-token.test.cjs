const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { AuthService } = require('../dist/modules/auth/auth.service');
const secret = 'isolated-token-validation-secret-2026';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (payload, header = { alg: 'HS256', typ: 'JWT' }) => {
  const content = `${encode(header)}.${encode(payload)}`;
  return `${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`;
};
const payload = () => { const now = Math.floor(Date.now() / 1000); return {
  sub: '00000000-0000-4000-8000-000000000001', username: 'test', version: 1, iat: now, exp: now + 3600,
}; };
const makeService = () => {
  let queries = 0;
  const service = new AuthService({ query: async () => { queries++; return { rows: [] }; } },
    { get: (key, fallback) => key === 'AUTH_SECRET' ? secret : fallback });
  return { service, queries: () => queries };
};

test('malformed, tampered and invalid signed claims are rejected before database access', async () => {
  const { service, queries } = makeService();
  const good = sign(payload());
  const invalid = [good + '.extra', good + ' ', '', 'x'.repeat(4097), good.slice(0, -1),
    sign(payload(), { alg: 'none', typ: 'JWT' }), sign(payload(), { alg: 'HS256', typ: 'OTHER' })];
  for (const change of [{ exp: undefined }, { exp: '9999999999' }, { iat: undefined },
    { iat: Math.floor(Date.now() / 1000) + 60 }, { exp: 1 }, { exp: 9999999999 },
    { version: -1 }, { version: '1' }, { sub: 'not-a-uuid' }, { username: {} }, { username: '' }]) {
    invalid.push(sign({ ...payload(), ...change }));
  }
  for (const token of invalid) await assert.rejects(service.validateAccessToken(token), error => error.getStatus() === 401);
  assert.equal(queries(), 0);
});

test('valid token still checks current user and session version', async () => {
  const { service } = makeService();
  service.loadUser = async () => ({ sessionVersion: 1 });
  assert.equal((await service.validateAccessToken(sign(payload()))).sessionVersion, 1);
  service.loadUser = async () => ({ sessionVersion: 2 });
  await assert.rejects(service.validateAccessToken(sign(payload())), error => error.getStatus() === 401);
});

test('administrator legacy session cannot bypass MFA', async () => {
  const { service, queries } = makeService();
  service.loadUser = async () => ({ sessionVersion: 1, roleCode: 'JEFA', id: payload().sub });
  await assert.rejects(service.validateAccessToken(sign(payload())), error => error.getStatus() === 401);
  assert.equal(queries(), 0);
  await assert.rejects(service.validateAccessToken(sign({ ...payload(), mfa: true })), error => error.getStatus() === 401);
});
