const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { ShiftsService } = require('../dist/modules/shifts/shifts.service');
const config = { get: (key, fallback) => key === 'AUTH_SECRET' ? 'isolated-egress-optimization-secret-2026' : fallback };

test('session guard excludes profile photo from SQL without caching permissions or revocation', async () => {
  const calls = [];
  const row = { id: randomUUID(), username: 'test', role_code: 'CAJERO', session_version: 1, profile_photo: null };
  const auth = new AuthService({ query: async (sql, args) => { calls.push({ sql, args }); return { rows: [row] }; } }, config);
  const token = auth.issueToken({ id: row.id, username: row.username, sessionVersion: 1 });
  await auth.validateAccessToken(token);
  assert.ok(!calls[0].sql.includes('u.foto_perfil'));
  assert.match(calls[0].sql, /u.estado = 'ACTIVO' and r.estado = 'ACTIVO'/);
  await auth.validateAccessToken(token);
  assert.equal(calls.filter(call => call.sql.includes('from temo.usuarios u')).length, 2);
  row.session_version = 2;
  await assert.rejects(auth.validateAccessToken(token), error => error.getStatus() === 401);
});

test('shift access has a single scoped lightweight query and refuses other profiles', async () => {
  const calls = [];
  const active = { database_id: randomUUID(), estado: 'PENDIENTE_APROBACION', sucursal: 'Branch', caja: 'Register' };
  const prepared = { ...active, database_id: randomUUID(), estado: 'PENDIENTE_APERTURA' };
  const shifts = new ShiftsService({ query: async (sql, args) => { calls.push({ sql, args }); return { rows: [prepared, active] }; } });
  for (const roleCode of ['JEFA', 'TRANSFERISTA', 'UNKNOWN']) await assert.rejects(shifts.access({ roleCode }), e => e.getStatus() === 403);
  assert.equal(calls.length, 0);
  const id = randomUUID();
  assert.deepEqual(await shifts.access({ roleCode: 'CAJERO', id }), { active, prepared });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [id]);
  assert.ok(!/saldos|arqueos|transacciones|select \*/.test(calls[0].sql));
});

test('preview: photo survives login and me, lightweight validation still revokes immediately', { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview', options: '-c search_path=temo,extensions,public' });
  await client.connect();
  try {
    await client.query('begin');
    const username = `egress_${randomUUID().replaceAll('-', '')}`;
    const photo = `data:image/png;base64,${'A'.repeat(15000)}`;
    const row = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,foto_perfil,debe_cambiar_contrasena)
      select id_rol,'Egress','Fixture',$1,crypt('InitialPassword123!',gen_salt('bf',4)),$2,false from temo.roles where codigo='CAJERO'
      returning id_usuario as id`, [username, photo])).rows[0];
    const auth = new AuthService({ query: (sql, args) => client.query(sql, args), transaction: work => work(client) }, config);
    const login = await auth.login(username, 'InitialPassword123!', '', 'Egress test');
    assert.equal(login.user.profilePhoto, photo);
    const validated = await auth.validateAccessToken(login.token);
    assert.equal(validated.profilePhoto, null);
    assert.equal((await auth.session(validated)).user.profilePhoto, photo);
    const lightBytes = Buffer.byteLength(JSON.stringify(validated));
    const fullBytes = Buffer.byteLength(JSON.stringify(login.user));
    assert.ok(fullBytes - lightBytes >= 15000);
    await client.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1', [row.id]);
    await assert.rejects(auth.validateAccessToken(login.token), error => error.getStatus() === 401);
  } finally { await client.query('rollback'); await client.end(); }
});

test('current shift reuses its authorized row but refreshes all operational data on every call', async () => {
  const shifts = new ShiftsService({});
  const user = { id: randomUUID(), roleCode: 'CAJERO' };
  const shift = { database_id: randomUUID(), id_sucursal: randomUUID() };
  const calls = [];
  let amount = 100;
  shifts.findCurrentShift = async received => { assert.equal(received, user); calls.push('authorized'); return shift; };
  shifts.findAuthorizedShift = async () => { throw new Error('redundant authorization row read'); };
  shifts.ensureCurrentCashCount = async (id, userId) => { assert.equal(id, shift.database_id); assert.equal(userId, user.id); calls.push('ensure'); };
  shifts.loadCashCounts = async id => { assert.equal(id, shift.database_id); calls.push('counts'); return { ACTUAL: { NIO: { total: amount } } }; };
  shifts.loadBalances = async () => { calls.push('balances'); return [{ system: amount }]; };
  shifts.loadAvailableAccounts = async id => { assert.equal(id, shift.id_sucursal); calls.push('accounts'); return []; };
  shifts.loadAvailableMovements = async () => { calls.push('movements'); return []; };
  shifts.loadCashSummary = async () => { calls.push('summary'); return { expected: amount }; };
  const first = await shifts.current(user);
  amount = 200;
  const second = await shifts.current(user);
  assert.equal(first.balances[0].system, 100);
  assert.equal(second.balances[0].system, 200);
  assert.equal(second.cashCounts.ACTUAL.NIO.total, 200);
  assert.equal(second.expected, 200);
  assert.deepEqual(calls, Array(2).fill(['authorized', 'ensure', 'counts', 'balances', 'accounts', 'movements', 'summary']).flat());
  shifts.findCurrentShift = async () => null;
  assert.equal(await shifts.current(user), null);
});
