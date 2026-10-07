const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { MfaSecretVault } = require('../dist/modules/auth/mfa-secret-vault');

test('MFA vault encrypts with fresh nonce and binds ciphertext to its owner', () => {
  const vault = new MfaSecretVault(randomBytes(32).toString('base64'));
  const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const first = vault.encrypt('user-1', secret);
  assert.notEqual(first, vault.encrypt('user-1', secret));
  assert.ok(!first.includes(secret));
  assert.equal(vault.decrypt('user-1', first), secret);
  assert.throws(() => vault.decrypt('user-2', first));
  assert.throws(() => new MfaSecretVault(randomBytes(32).toString('base64')).decrypt('user-1', first));
  const parts = first.split('.');
  const data = Buffer.from(parts[3], 'base64url'); data[0] ^= 1; parts[3] = data.toString('base64url');
  assert.throws(() => vault.decrypt('user-1', parts.join('.')));
  for (const bad of ['', first + '.extra', 'v2.a.b.c', 'x'.repeat(513)]) assert.throws(() => vault.decrypt('user-1', bad));
});

test('MFA vault rejects invalid keys and seeds', () => {
  for (const key of ['', 'development', randomBytes(16).toString('base64')]) assert.throws(() => new MfaSecretVault(key));
  const vault = new MfaSecretVault(randomBytes(32).toString('base64'));
  assert.throws(() => vault.encrypt('user', 'short'));
  assert.throws(() => vault.encrypt('', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'));
});

test('production startup refuses missing MFA key or schema', async () => {
  const { MfaService } = require('../dist/modules/auth/mfa.service');
  const config = key => ({ get: (name, fallback) => ({ APP_ENV: 'production', MFA_ENCRYPTION_KEY: key }[name] ?? fallback) });
  assert.throws(() => new MfaService({}, config('')));
  const key = randomBytes(32).toString('base64');
  const missing = new MfaService({ query: async () => ({ rows: [{ ready: false }] }) }, config(key));
  await assert.rejects(missing.onModuleInit());
  const ready = new MfaService({ query: async () => ({ rows: [{ ready: true }] }) }, config(key));
  await ready.onModuleInit();
});
