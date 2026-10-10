const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { AuthService } = require('../dist/modules/auth/auth.service');

function service(db = {}, overrides = {}) {
  const settings = {
    AUTH_SECRET: 'isolated-recovery-email-test-secret-2026',
    RESEND_API_KEY: 'test-key-never-send',
    PASSWORD_RESET_EMAIL_FROM: 'TEMO <accesos@notificaciones.example.invalid>',
    ...overrides,
  };
  return new AuthService(db, { get: (key, fallback) => settings[key] ?? fallback });
}

test('recovery email uses configured sender, registered recipient and escaped name', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, ...options };
    return { ok: true };
  });
  await service().sendRecoveryEmail('registered@example.invalid', '<img onerror="bad">', '012345');
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.ok(request.signal instanceof AbortSignal);
  const payload = JSON.parse(request.body);
  assert.deepEqual(payload.to, ['registered@example.invalid']);
  assert.equal(payload.from, 'TEMO <accesos@notificaciones.example.invalid>');
  assert.match(payload.html, /012345/);
  assert.match(payload.html, /&lt;img/);
  assert.ok(!payload.html.includes('<img'));
  assert.ok(!request.body.includes('test-key-never-send'));
});

test('preview: concurrent requests share durable account limits and audit failure rolls back the new code',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
      options: '-c search_path=temo,extensions,public', max: 4 });
    let userId;
    const transaction = async (work, failAudit = false) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await work({ query: (sql, params) => {
          if (failAudit && sql.includes('insert into temo.bitacora')) throw new Error('simulated audit failure');
          return client.query(sql, params);
        } });
        await client.query('commit');
        return result;
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    };
    try {
      const username = `recovery_parallel_${randomUUID().replaceAll('-', '')}`;
      const email = `${username}@example.invalid`;
      userId = (await pool.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,correo,contrasena_hash)
        select id_rol,'Recovery','Parallel',$1,$2,crypt('OriginalPassword123!',gen_salt('bf',4))
        from temo.roles where codigo='JEFA' returning id_usuario as id`, [username, email])).rows[0].id;
      const sent = [];
      const db = { query: (sql, params) => pool.query(sql, params), transaction };
      const firstInstance = service(db);
      const secondInstance = service(db);
      for (const auth of [firstInstance, secondInstance]) {
        t.mock.method(auth, 'sendRecoveryEmail', async (to, name, code) => sent.push({ to, name, code }));
      }
      await Promise.all([
        firstInstance.requestPasswordRecovery(username, '127.0.0.1', 'first API instance'),
        secondInstance.requestPasswordRecovery(email, '127.0.0.2', 'second API instance'),
      ]);
      assert.equal(sent.length, 1);
      await pool.query("update temo.recuperaciones_contrasena set fecha_creacion=now()-interval '2 minutes' where id_usuario=$1", [userId]);
      await Promise.all([
        secondInstance.requestPasswordRecovery(username, '127.0.0.3', 'second API instance'),
        firstInstance.requestPasswordRecovery(email, '127.0.0.4', 'first API instance'),
      ]);
      assert.equal(sent.length, 2);
      const before = (await pool.query('select id_recuperacion,consumido_en from temo.recuperaciones_contrasena where id_usuario=$1 order by id_recuperacion', [userId])).rows;
      assert.equal(before.length, 2);
      assert.equal(before.filter(row => !row.consumido_en).length, 1);
      await pool.query("update temo.recuperaciones_contrasena set fecha_creacion=now()-interval '2 minutes' where id_usuario=$1", [userId]);
      const failing = service({ ...db, transaction: work => transaction(work, true) });
      t.mock.method(failing.logger, 'error', () => {});
      t.mock.method(failing, 'sendRecoveryEmail', async () => assert.fail('audit failure must prevent sending'));
      assert.equal((await failing.requestPasswordRecovery(username, '', '')).success, true);
      const after = (await pool.query('select id_recuperacion,consumido_en from temo.recuperaciones_contrasena where id_usuario=$1 order by id_recuperacion', [userId])).rows;
      assert.deepEqual(after, before, 'rollback must retain the previous valid code and remove the new one');
    } finally {
      if (userId) await transaction(async client => {
        await client.query('delete from temo.bitacora where id_usuario=$1', [userId]);
        await client.query('delete from temo.recuperaciones_contrasena where id_usuario=$1', [userId]);
        await client.query('delete from temo.usuarios where id_usuario=$1', [userId]);
      });
      await pool.end();
    }
  });

test('recovery transport is bounded to ten seconds and abort failures propagate', async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 10_000);
    controller.abort();
    return controller.signal;
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    options.signal.throwIfAborted();
    assert.fail('aborted request must not proceed');
  });
  await assert.rejects(service().sendRecoveryEmail('registered@example.invalid', 'Admin', '012345'),
    error => error.name === 'AbortError');
});

test('missing mail configuration fails before contacting any external provider', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('missing configuration must not send'));
  for (const settings of [{ RESEND_API_KEY: '' }, { PASSWORD_RESET_EMAIL_FROM: '' }]) {
    await assert.rejects(service({}, settings).sendRecoveryEmail('registered@example.invalid', 'Admin', '012345'));
  }
});

test('provider rejection never includes response body or credentials in exception', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403,
    text: async () => assert.fail('provider body must not be exposed') }));
  await assert.rejects(service().sendRecoveryEmail('registered@example.invalid', 'Admin', '012345'),
    error => error.message === 'Resend rechazó el correo con estado 403.');
});

test('send failures invalidate the code, retain abuse history and generic public response', async t => {
  const statements = [];
  const db = { query: async (sql, params) => {
    statements.push({ sql, params });
    if (sql.includes('select u.id_usuario')) return { rows: [{ id: 'user-id', email: 'registered@example.invalid', full_name: 'Admin' }] };
    if (sql.includes('cooling_down')) return { rows: [{ requests: 0, cooling_down: false }] };
    if (sql.includes('returning id_recuperacion')) return { rows: [{ id: 'recovery-id' }] };
    return { rows: [] };
  } };
  db.transaction = work => work(db);
  const auth = service(db);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('private provider details'); });
  const messages = [];
  t.mock.method(auth.logger, 'error', message => messages.push(message));
  const response = await auth.requestPasswordRecovery('ADMIN', '127.0.0.1', 'test');
  assert.deepEqual(response, { success: true, message: 'Si los datos coinciden, recibirá un código de recuperación en el correo registrado.' });
  assert.match(statements[0].sql, /r.codigo = 'JEFA'/);
  assert.deepEqual(statements[0].params, ['admin']);
  assert.match(statements.at(-1).sql, /update temo.recuperaciones_contrasena set consumido_en/);
  assert.deepEqual(statements.at(-1).params, ['recovery-id']);
  assert.deepEqual(messages, ['No fue posible enviar el correo de recuperación.']);
  assert.ok(statements.some(item => item.sql.includes('insert into temo.bitacora')));
});

test('account cooldown and rolling quota do not send, mutate codes or reveal identity', async t => {
  for (const recent of [{ requests: 1, cooling_down: true }, { requests: 3, cooling_down: false }]) {
    const statements = [];
    const db = { query: async (sql, params) => {
      statements.push({ sql, params });
      if (sql.includes('select u.id_usuario')) return { rows: [{ id: 'same-account' }] };
      if (sql.includes('cooling_down')) return { rows: [recent] };
      assert.match(sql, /pg_advisory_xact_lock/);
      assert.deepEqual(params, ['same-account']);
      return { rows: [] };
    } };
    db.transaction = work => work(db);
    const auth = service(db);
    t.mock.method(auth, 'sendRecoveryEmail', async () => assert.fail('throttled account must not send'));
    assert.equal((await auth.requestPasswordRecovery('ADMIN', '127.0.0.2', 'test')).success, true);
    assert.equal(statements.length, 3);
  }
});

test('audit preparation failure returns generic response without sending any unusable email', async t => {
  let rolledBack = false;
  const db = { query: async () => ({ rows: [{ id: 'user-id' }] }), transaction: async work => {
    try { return await work({ query: async sql => {
      if (sql.includes('cooling_down')) return { rows: [{ requests: 0, cooling_down: false }] };
      if (sql.includes('returning id_recuperacion')) return { rows: [{ id: 'recovery-id' }] };
      if (sql.includes('insert into temo.bitacora')) throw new Error('private database detail');
      return { rows: [] };
    } }); } catch (error) { rolledBack = true; throw error; }
  } };
  const auth = service(db);
  const messages = [];
  t.mock.method(auth.logger, 'error', message => messages.push(message));
  t.mock.method(auth, 'sendRecoveryEmail', async () => assert.fail('must not send before audit commits'));
  assert.equal((await auth.requestPasswordRecovery('ADMIN', '', '')).success, true);
  assert.ok(rolledBack);
  assert.deepEqual(messages, ['No fue posible preparar la recuperación.']);
});

test('preview: emailed recovery survives audit, newest code works once and MFA remains enabled',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
    const { Client } = require('pg');
    const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
      options: '-c search_path=temo,extensions,public' });
    await client.connect();
    try {
      await client.query('begin');
      const username = `recovery_${randomUUID().replaceAll('-', '')}`;
      const email = `${username}@example.invalid`;
      const user = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,correo,contrasena_hash,debe_cambiar_contrasena)
        select id_rol,'Recovery','Test',$1,$2,crypt('OriginalPassword123!',gen_salt('bf',4)),false
        from temo.roles where codigo='JEFA' returning id_usuario as id,version_sesion`, [username, email])).rows[0];
      assert.ok(user);
      const auth = service({ query: (sql, params) => client.query(sql, params), transaction: work => work(client) });
      const sent = [];
      t.mock.method(auth, 'sendRecoveryEmail', async (to, name, code) => sent.push({ to, name, code }));
      await auth.requestPasswordRecovery(username, '127.0.0.1', 'recovery test');
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, email);
      const first = (await client.query('select * from temo.recuperaciones_contrasena where id_usuario=$1', [user.id])).rows;
      assert.equal(first.length, 1, 'audit must not delete the already emailed code');
      assert.equal(first[0].consumido_en, null);
      assert.equal(first[0].codigo_hash, auth.hashRecoveryCode(user.id, sent[0].code));
      const audit = (await client.query(`select accion,datos_nuevos from temo.bitacora
        where id_registro=$1 and tabla='recuperaciones_contrasena'`, [first[0].id_recuperacion])).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].accion, 'CREAR');
      assert.deepEqual(audit[0].datos_nuevos, { evento: 'SOLICITUD_RECUPERACION' });
      await auth.requestPasswordRecovery(email, '127.0.0.2', 'other IP');
      assert.equal(sent.length, 1, 'email alias and different IP must share cooldown');
      assert.equal((await client.query('select consumido_en from temo.recuperaciones_contrasena where id_recuperacion=$1',
        [first[0].id_recuperacion])).rows[0].consumido_en, null, 'throttle must preserve current code');
      await client.query("update temo.recuperaciones_contrasena set fecha_creacion=now()-interval '2 minutes' where id_usuario=$1", [user.id]);
      await auth.requestPasswordRecovery(username, '127.0.0.1', 'recovery test');
      assert.equal(sent.length, 2);
      assert.ok((await client.query('select consumido_en from temo.recuperaciones_contrasena where id_recuperacion=$1',
        [first[0].id_recuperacion])).rows[0].consumido_en);
      await auth.confirmPasswordRecovery(username, sent[1].code, 'RecoveredPassword123!', '127.0.0.1', 'recovery test');
      await assert.rejects(auth.confirmPasswordRecovery(username, sent[1].code, 'AnotherPassword123!', '', ''),
        error => error.getStatus() === 400);
      const changed = (await client.query(`select version_sesion,contrasena_hash=crypt('RecoveredPassword123!',contrasena_hash) as valid
        from temo.usuarios where id_usuario=$1`, [user.id])).rows[0];
      assert.equal(changed.valid, true);
      assert.equal(changed.version_sesion, user.version_sesion + 1);
      await client.query("update temo.recuperaciones_contrasena set fecha_creacion=now()-interval '2 minutes' where id_usuario=$1", [user.id]);
      await auth.requestPasswordRecovery(username, '', 'third request');
      assert.equal(sent.length, 3);
      await client.query("update temo.recuperaciones_contrasena set fecha_creacion=now()-interval '2 minutes' where id_usuario=$1", [user.id]);
      await auth.requestPasswordRecovery(email, '127.0.0.3', 'fourth request');
      assert.equal(sent.length, 3, 'rolling quota must survive consumed codes and new IPs');
      let challenged = false;
      auth.mfa = { begin: async () => { challenged = true; return { mfaRequired: true }; } };
      // Login must still reach MFA after password recovery instead of issuing a session.
      const login = await auth.login(username, 'RecoveredPassword123!', '127.0.0.1', 'recovery test');
      assert.ok(challenged);
      assert.equal(login.token, undefined);
    } finally {
      await client.query('rollback');
      await client.end();
    }
  });
