const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePasswordForStorage } = require('../dist/common/password-policy');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { CatalogsService } = require('../dist/modules/catalogs/catalogs.service');

const ascii72 = 'Aa1' + 'x'.repeat(69);
const unicode72 = 'Aa1' + '\u00e9'.repeat(34) + 'x';
const unicode73 = 'Aa1' + '\u00e9'.repeat(35);
const config = { get: (key, fallback) => key === 'AUTH_SECRET' ? 'isolated-password-policy-test-secret-2026' : fallback };

test('stored passwords enforce the byte boundary, not just character count', () => {
  assert.equal(Buffer.byteLength(ascii72), 72);
  assert.equal(Buffer.byteLength(unicode72), 72);
  assert.equal(Buffer.byteLength(unicode73), 73);
  for (const password of ['Password123!', ascii72, unicode72, ' Password123! ']) {
    assert.doesNotThrow(() => validatePasswordForStorage(password));
  }
  for (const password of [ascii72 + 'x', unicode73, 'Aa1' + '\ud83d\udd12'.repeat(18)]) {
    assert.throws(() => validatePasswordForStorage(password), error => error.getStatus() === 400 && /72 bytes/.test(error.message));
  }
});

test('shared policy preserves minimum complexity and refuses null bytes without reflecting secrets', () => {
  for (const password of [null, [], 'Aa1short', 'lowercase123', 'UPPERCASE123', 'NoDigitsHere', 'Password123!\0']) {
    assert.throws(() => validatePasswordForStorage(password), error => {
      assert.equal(error.getStatus(), 400);
      assert.ok(!error.message.includes('Password123!'));
      return true;
    });
  }
});

test('password change, recovery and temporary reset reject oversized keys before database work', async () => {
  let calls = 0;
  const db = { query: async () => { calls++; }, transaction: async () => { calls++; } };
  const auth = new AuthService(db, config);
  const catalogs = new CatalogsService(db);
  for (const password of [ascii72 + 'x', unicode73]) {
    await assert.rejects(auth.changePassword({ id: 'actor' }, 'CurrentPassword123!', password, '', ''), e => e.getStatus() === 400);
    await assert.rejects(auth.confirmPasswordRecovery('admin', '012345', password, '', ''), e => e.getStatus() === 400);
    await assert.rejects(catalogs.resetUserPassword('target', password, { roleCode: 'JEFA' }, '', ''), e => e.getStatus() === 400);
    assert.throws(() => catalogs.validateTemporaryPassword(password), e => e.getStatus() === 400);
  }
  assert.equal(calls, 0);
});

test('login keeps accepting existing-format passwords above the new storage boundary', async () => {
  const password = ascii72 + 'legacy-suffix';
  let checked;
  const auth = new AuthService({ transaction: async work => work({ query: async (sql, params) => {
    if (sql.includes('crypt(')) { checked = params; return { rows: [{ password_valid: true }] }; }
    return { rows: [{ id: 'existing-user', role_code: 'CAJERO' }] };
  } }) }, config);
  auth.buildAuthenticatedUser = async () => ({ id: 'existing-user', roleCode: 'CAJERO' });
  auth.completeLogin = async () => ({ token: 'test-session' });
  assert.equal((await auth.login('CASHIER', password, '', '')).token, 'test-session');
  assert.equal(checked[1], password);
});

test('preview: passwords at the ASCII and UTF-8 byte limits hash and verify without truncation',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const { Client } = require('pg');
    const db = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
      options: '-c search_path=temo,extensions,public' });
    await db.connect();
    try {
      for (const password of [ascii72, unicode72, ' Password123! ']) {
        validatePasswordForStorage(password);
        const result = await db.query(`with hashed as (select crypt($1,gen_salt('bf',4)) as value)
          select crypt($1,value)=value as valid,crypt($2,value)=value as altered from hashed`,
        [password, password.slice(0, -1) + 'z']);
        assert.equal(result.rows[0].valid, true);
        assert.equal(result.rows[0].altered, false);
      }
    } finally { await db.end(); }
  });
