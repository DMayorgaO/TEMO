const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { AuthService } = require('../dist/modules/auth/auth.service');
const config = { get: (key, fallback) => key === 'AUTH_SECRET' ? 'isolated-login-concurrency-test-secret-2026' : fallback };

test('blocked or nonexistent accounts never execute crypt; failed decisions commit before rejection', async () => {
  for (const row of [undefined, { id: randomUUID(), blocked: true }]) {
    let committed = false;
    let attempts = 0;
    const auth = new AuthService({ transaction: async work => {
      const value = await work({ query: async sql => {
        assert.ok(!sql.includes('crypt('));
        assert.ok(!sql.includes('update temo.usuarios'));
        if (sql.includes('insert into temo.intentos')) attempts++;
        return { rows: sql.includes('for update of u') && row ? [row] : [] };
      } });
      committed = true;
      return value;
    } }, config);
    await assert.rejects(auth.login('TEST', 'CandidatePassword123!', '', ''), e => e.getStatus() === (row ? 429 : 401));
    assert.equal(committed, true);
    assert.equal(attempts, 1);
  }
});

test('session completion fails closed before successful-access audit when identity no longer matches', async () => {
  let statements = 0;
  const actor = { id: randomUUID(), roleId: randomUUID(), roleCode: 'CAJERO', username: 'test', sessionVersion: 2 };
  const auth = new AuthService({ transaction: async work => work({ query: async (sql, values) => {
    statements++;
    assert.match(sql, /u.version_sesion = \$2/);
    assert.match(sql, /r.estado = 'ACTIVO'/);
    assert.match(sql, /u.bloqueado_hasta <= now\(\)/);
    assert.deepEqual(values, [actor.id, 2, actor.roleId, 'test', 'CAJERO']);
    return { rowCount: 0, rows: [] };
  } }) }, config);
  await assert.rejects(auth.completeLogin(actor, '', ''), e => e.getStatus() === 401);
  assert.equal(statements, 1);
});

test('preview: concurrent login checks persist exact lockout and refuse stale session completion',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
      options: '-c search_path=temo,extensions,public', max: 10 });
    const username = `login_${randomUUID().replaceAll('-', '')}`;
    const password = 'InitialPassword123!';
    let id;
    let hashes = 0;
    let failAttempts = false;
    let failAudit = false;
    const db = { query: (sql, values) => pool.query(sql, values), transaction: async work => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const value = await work({ query: (sql, values) => {
          if (sql.includes('crypt(')) hashes++;
          if (failAttempts && sql.includes('insert into temo.intentos_inicio_sesion')) throw new Error('isolated attempt failure');
          if (failAudit && sql.includes('insert into temo.bitacora')) throw new Error('isolated audit failure');
          return client.query(sql, values);
        } });
        await client.query('commit');
        return value;
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    } };
    const state = async () => (await pool.query(`select intentos_fallidos,bloqueado_hasta,ultimo_acceso,version_sesion
      from temo.usuarios where id_usuario=$1`, [id])).rows[0];
    try {
      const roles = (await pool.query("select id_rol,codigo from temo.roles where codigo in ('CAJERO','JEFA')")).rows;
      const cashierRole = roles.find(row => row.codigo === 'CAJERO').id_rol;
      const adminRole = roles.find(row => row.codigo === 'JEFA').id_rol;
      id = (await pool.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
        values($1,'Login','Concurrency',$2,crypt($3,gen_salt('bf',4)),false) returning id_usuario`,
      [cashierRole, username, password])).rows[0].id_usuario;
      const auth = new AuthService(db, config);
      await t.test('eight simultaneous checks across service instances perform only five hashes', async () => {
        const instances = Array.from({ length: 3 }, () => new AuthService(db, config));
        const results = await Promise.all(Array.from({ length: 8 }, (_, n) =>
          instances[n % 3].login(n % 2 ? username.toUpperCase() : username, 'WrongPassword123!', `127.0.0.${n + 1}`, 'test')
            .then(() => 201, error => error.getStatus())));
        assert.deepEqual(results.sort(), [401, 401, 401, 401, 401, 429, 429, 429]);
        assert.equal(hashes, 5);
        const row = await state();
        assert.equal(row.intentos_fallidos, 5);
        assert.ok(row.bloqueado_hasta > new Date());
        assert.equal((await pool.query('select count(*)::integer as n from temo.intentos_inicio_sesion where usuario_normalizado=$1',
          [username])).rows[0].n, 8);
        const until = row.bloqueado_hasta.getTime();
        await assert.rejects(auth.login(username, password, '', 'test'), e => e.getStatus() === 429);
        assert.equal(hashes, 5);
        assert.equal((await state()).bloqueado_hasta.getTime(), until, 'blocked attempts must not extend the penalty');
      });
      await t.test('expired block starts a fresh failure cycle, successful login resets it', async () => {
        await pool.query("update temo.usuarios set bloqueado_hasta=now()-interval '1 second' where id_usuario=$1", [id]);
        await assert.rejects(auth.login(username, 'WrongPassword123!', '', 'test'), e => e.getStatus() === 401);
        assert.equal((await state()).intentos_fallidos, 1);
        assert.equal((await state()).bloqueado_hasta, null);
        const session = await auth.login(username, password, '', 'test');
        assert.ok(session.token);
        assert.equal((await auth.validateAccessToken(session.token)).id, id);
        assert.equal((await state()).intentos_fallidos, 0);
      });
      await t.test('attempt-persistence failure rolls back the failure counter', async () => {
        failAttempts = true;
        try { await assert.rejects(auth.login(username, 'WrongPassword123!', '', 'test'), /isolated attempt failure/); }
        finally { failAttempts = false; }
        assert.equal((await state()).intentos_fallidos, 0);
      });
      await t.test('account changes between password verification and session issuance deny login', async () => {
        for (const mutation of [
          "estado='INACTIVO'", `id_rol='${adminRole}'::uuid`, "usuario=usuario||'_changed'",
          'version_sesion=version_sesion+1', "bloqueado_hasta=now()+interval '15 minutes'",
        ]) {
          const instance = new AuthService(db, config);
          const original = instance.buildAuthenticatedUser.bind(instance);
          instance.buildAuthenticatedUser = async row => {
            const actor = await original(row);
            // Fixed test mutations only; deliberately run after credential transaction releases its row lock.
            await pool.query(`update temo.usuarios set ${mutation} where id_usuario=$1`, [id]);
            return actor;
          };
          await assert.rejects(instance.login(username, password, '', 'test'), e => e.getStatus() === 401);
          await pool.query(`update temo.usuarios set estado='ACTIVO',id_rol=$2,usuario=$3,bloqueado_hasta=null
            where id_usuario=$1`, [id, cashierRole, username]);
        }
      });
      await t.test('successful-access audit failure rolls back last access and counter reset', async () => {
        await pool.query('update temo.usuarios set ultimo_acceso=null,intentos_fallidos=2 where id_usuario=$1', [id]);
        failAudit = true;
        try { await assert.rejects(auth.login(username, password, '', 'test'), /isolated audit failure/); }
        finally { failAudit = false; }
        assert.equal((await state()).ultimo_acceso, null);
        assert.equal((await state()).intentos_fallidos, 2);
      });
    } finally {
      await pool.query('delete from temo.intentos_inicio_sesion where usuario_normalizado=$1', [username]);
      if (id) {
        await pool.query('delete from temo.bitacora where id_usuario=$1', [id]);
        await pool.query('delete from temo.usuarios where id_usuario=$1', [id]);
      }
      await pool.end();
    }
  });
