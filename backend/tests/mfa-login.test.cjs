const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { Client } = require('pg');
const { TOTP } = require('otpauth');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { MfaService } = require('../dist/modules/auth/mfa.service');
const { MfaSecretVault } = require('../dist/modules/auth/mfa-secret-vault');

test('Administrator MFA lifecycle in isolated preview, rolled back', { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
  const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview', options: '-c search_path=temo,extensions,public' });
  await client.connect();
  try {
    await client.query('begin');
    let count = 0;
    const db = { query: (sql, values) => client.query(sql, values), transaction: async work => {
      const name = `mfa_${++count}`; await client.query(`savepoint ${name}`);
      try { const result = await work(client); await client.query(`release savepoint ${name}`); return result; }
      catch (error) { await client.query(`rollback to savepoint ${name}`); throw error; }
    } };
    const key = randomBytes(32).toString('base64');
    const config = { get: (name, fallback) => ({ AUTH_SECRET: 'isolated-mfa-authentication-secret-2026', MFA_ENCRYPTION_KEY: key }[name] ?? fallback) };
    const mfa = new MfaService(db, config);
    const auth = new AuthService(db, config, mfa);
    const username = `mfa_${randomUUID().replaceAll('-', '')}`;
    const password = 'TemoPruebas2026!';
    const id = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
      select id_rol,'MFA','TEST',$1,crypt($2,gen_salt('bf',4)),false from temo.roles where codigo='JEFA' returning id_usuario`, [username, password])).rows[0].id_usuario;
    const hash = value => createHash('sha256').update(value).digest('hex');
    const seed = async challenge => new MfaSecretVault(key).decrypt(id, (await client.query(`select secreto_cifrado from temo.desafios_mfa where token_hash=$1`, [hash(challenge)])).rows[0].secreto_cifrado);
    let setup; let secret; let session; let usedCode;
    await t.test('password does not grant access; first login returns QR', async () => {
      setup = await auth.login(username, password, '', 'test');
      assert.equal(setup.mfaRequired, true); assert.equal(setup.enrollment, true);
      assert.equal(setup.token, undefined); assert.ok(setup.qrDataUrl.startsWith('data:image/png;base64,'));
      assert.equal((await client.query(`select ultimo_acceso from temo.usuarios where id_usuario=$1`, [id])).rows[0].ultimo_acceso, null);
      await assert.rejects(auth.validateAccessToken(setup.challenge), error => error.getStatus() === 401);
      secret = await seed(setup.challenge);
      const { PNG } = require('pngjs');
      const decodeQr = require('jsqr');
      const png = PNG.sync.read(Buffer.from(setup.qrDataUrl.split(',')[1], 'base64'));
      const decoded = decodeQr(new Uint8ClampedArray(png.data), png.width, png.height);
      assert.ok(decoded, 'generated QR must be readable');
      const uri = new URL(decoded.data);
      assert.equal(uri.protocol, 'otpauth:'); assert.equal(uri.hostname, 'totp');
      assert.equal(uri.searchParams.get('secret'), secret);
      assert.equal(uri.searchParams.get('issuer'), 'TEMO');
      assert.equal(uri.searchParams.get('digits'), '6'); assert.equal(uri.searchParams.get('period'), '30');
    });
    await t.test('wrong OTP persists failed attempt; valid OTP activates MFA and returns recovery codes', async () => {
      const otp = new TOTP({ secret });
      let wrong = '000000';
      while (otp.validate({ token: wrong, window: 1 }) !== null) wrong = String(Number(wrong) + 1).padStart(6, '0');
      await assert.rejects(auth.verifyMfa(setup.challenge, wrong, '', '', 'test'), error => error.getStatus() === 401);
      assert.equal((await client.query(`select intentos from temo.desafios_mfa where token_hash=$1`, [hash(setup.challenge)])).rows[0].intentos, 1);
      usedCode = otp.generate();
      session = await auth.verifyMfa(setup.challenge, usedCode, '', '', 'test');
      assert.equal(session.recoveryCodes.length, 8); assert.equal((await auth.validateAccessToken(session.token)).id, id);
      assert.equal(JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url')).mfa, true);
      assert.equal((await client.query(`select codigo_hash from temo.recuperacion_mfa where id_usuario=$1`, [id])).rows.length, 8);
      await assert.rejects(auth.verifyMfa(setup.challenge, otp.generate(), '', '', 'test'), error => error.getStatus() === 401);
    });
    await t.test('subsequent login has no QR, replayed OTP rejected and recovery is single use', async () => {
      const next = await auth.login(username, password, '', 'test');
      assert.equal(next.enrollment, false); assert.equal(next.qrDataUrl, null);
      await assert.rejects(auth.verifyMfa(next.challenge, usedCode, '', '', 'test'), error => error.getStatus() === 401);
      const recovered = await auth.verifyMfa(next.challenge, '', session.recoveryCodes[0], '', 'test');
      assert.equal(recovered.recoveryCodes.length, 0);
      const again = await auth.login(username, password, '', 'test');
      await assert.rejects(auth.verifyMfa(again.challenge, '', session.recoveryCodes[0], '', 'test'), error => error.getStatus() === 401);
    });
    await t.test('expired challenge and revoked session fail; password reset cannot bypass MFA', async () => {
      await client.query(`update temo.desafios_mfa set creado_en=now()-interval '2 minutes' where id_usuario=$1`, [id]);
      const expired = await auth.login(username, password, '', 'test');
      await client.query(`update temo.desafios_mfa set vence_en=now()-interval '1 second' where token_hash=$1`, [hash(expired.challenge)]);
      await assert.rejects(auth.verifyMfa(expired.challenge, '', session.recoveryCodes[1], '', 'test'), error => error.getStatus() === 401);
      const pending = await auth.login(username, password, '', 'test');
      await client.query(`update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1`, [id]);
      await assert.rejects(auth.verifyMfa(pending.challenge, '', session.recoveryCodes[1], '', 'test'), error => error.getStatus() === 401);
      await assert.rejects(auth.validateAccessToken(session.token), error => error.getStatus() === 401);
      assert.equal((await auth.login(username, password, '', 'test')).enrollment, false);
    });
    await t.test('persistent failure limit cannot be bypassed by issuing another challenge', async () => {
      await client.query(`update temo.desafios_mfa set creado_en=now()-interval '2 minutes' where id_usuario=$1`, [id]);
      const challenge = await auth.login(username, password, '', 'test');
      for (let index = 0; index < 5; index++) await assert.rejects(auth.verifyMfa(challenge.challenge, 'bad', '', '', 'test'));
      await assert.rejects(auth.login(username, password, '', 'test'), error => error.getStatus() === 429);
    });
    await t.test('missing encryption key fails closed rather than issuing an administrator token', async () => {
      const unavailable = new MfaService(db, { get: (_, fallback) => fallback });
      await assert.rejects(unavailable.begin({ id, username, sessionVersion: 1 }), error => error.getStatus() === 503);
    });
  } finally { await client.query('rollback'); await client.end(); }
});
