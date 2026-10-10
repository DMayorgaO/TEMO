const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { useRestrictedPreviewRole } = require('./helpers/restricted-role.cjs');
const { inspectDatabasePrivileges } = require('../dist/modules/database/database-security');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { MfaService } = require('../dist/modules/auth/mfa.service');
const { MfaSecretVault } = require('../dist/modules/auth/mfa-secret-vault');
const { TOTP } = require('otpauth');

test('preview: restricted API role operates but cannot mutate audit or administer database objects',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
    const { Client } = require('pg');
    const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
      options: '-c search_path=temo,extensions,public' });
    await client.connect();
    let role;
    try {
      await client.query('begin');
      role = await useRestrictedPreviewRole(client);
      let counter = 0;
      const db = { query: (sql, values) => client.query(sql, values), transaction: async work => {
        const point = `restricted_${++counter}`;
        await client.query(`savepoint ${point}`);
        try { const value = await work(client); await client.query(`release savepoint ${point}`); return value; }
        catch (error) { await client.query(`rollback to savepoint ${point}`); await client.query(`release savepoint ${point}`); throw error; }
      } };
      await t.test('screening confirms no administrative, destructive or ownership capabilities', async () => {
        const report = await inspectDatabasePrivileges(client);
        assert.equal(report.suitableForRestrictedApi, true, JSON.stringify(report));
        assert.equal(report.ownedObjects, 0);
        assert.deepEqual(report.blockers, []);
      });
      await t.test('DDL, TRUNCATE, trigger creation and audit mutation are denied in PostgreSQL', async () => {
        for (const sql of [
          'create table temo.forbidden_role_fixture(id integer)',
          'alter table temo.bitacora add column forbidden_role_fixture integer',
          'drop table temo.bitacora', 'truncate temo.bitacora',
          'update temo.bitacora set accion=accion where false', 'delete from temo.bitacora where false',
          'create trigger forbidden_role_fixture before update on temo.bitacora for each row execute function temo.actualizar_fecha_modificacion()',
          'create role forbidden_role_fixture nologin',
          'update public.preview_migrations set name=name where false',
        ]) await assert.rejects(db.transaction(real => real.query(sql)), e => e.code === '42501');
      });
      await t.test('login, password change, session revocation and append-only audit work under restricted role', async () => {
        const username = `restricted_${randomUUID().replaceAll('-', '')}`;
        const id = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
          select id_rol,'Restricted','Fixture',$1,crypt('InitialPassword123!',gen_salt('bf',4)),false
          from temo.roles where codigo='CAJERO' returning id_usuario`, [username])).rows[0].id_usuario;
        const config = { get: (key, fallback) => key === 'AUTH_SECRET' ? 'isolated-restricted-role-auth-secret-2026' : fallback };
        const auth = new AuthService(db, config);
        const session = await auth.login(username, 'InitialPassword123!', '', 'Restricted pilot');
        assert.equal((await auth.validateAccessToken(session.token)).id, id);
        const changed = await auth.changePassword(session.user, 'InitialPassword123!', 'ChangedPassword123!', '', 'Restricted pilot');
        await assert.rejects(auth.validateAccessToken(session.token), e => e.getStatus() === 401);
        await auth.logout(changed.user, '', 'Restricted pilot');
        await assert.rejects(auth.validateAccessToken(changed.token), e => e.getStatus() === 401);
        const rows = (await client.query('select accion from temo.bitacora where id_usuario=$1 order by numero_auditoria', [id])).rows;
        assert.deepEqual(rows.map(row => row.accion), ['INICIAR_SESION', 'ACTUALIZAR', 'CERRAR_SESION']);
      });
      await t.test('administrator MFA and recovery work without ownership or administrative grants', async () => {
        const username = `restricted_admin_${randomUUID().replaceAll('-', '')}`;
        const id = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,correo,contrasena_hash,debe_cambiar_contrasena)
          select id_rol,'Restricted','Admin',$1,$2,crypt('InitialPassword123!',gen_salt('bf',4)),false
          from temo.roles where codigo='JEFA' returning id_usuario`, [username, `${username}@example.invalid`])).rows[0].id_usuario;
        const key = randomBytes(32).toString('base64');
        const config = { get: (name, fallback) => ({ AUTH_SECRET: 'isolated-restricted-role-auth-secret-2026', MFA_ENCRYPTION_KEY: key }[name] ?? fallback) };
        const auth = new AuthService(db, config, new MfaService(db, config));
        const setup = await auth.login(username, 'InitialPassword123!', '', 'Restricted MFA pilot');
        assert.equal(setup.enrollment, true);
        assert.equal(setup.token, undefined);
        const encrypted = (await client.query('select secreto_cifrado from temo.desafios_mfa where token_hash=$1',
          [createHash('sha256').update(setup.challenge).digest('hex')])).rows[0].secreto_cifrado;
        const secret = new MfaSecretVault(key).decrypt(id, encrypted);
        const session = await auth.verifyMfa(setup.challenge, new TOTP({ secret }).generate(), '', '', 'Restricted MFA pilot');
        assert.equal((await auth.validateAccessToken(session.token)).id, id);
        assert.equal(session.recoveryCodes.length, 8);
        let code;
        auth.sendRecoveryEmail = async (_email, _name, value) => { code = value; };
        assert.equal((await auth.requestPasswordRecovery(username, '', 'Restricted recovery pilot')).success, true);
        assert.match(code, /^\d{6}$/);
        await auth.confirmPasswordRecovery(username, code, 'RecoveredPassword123!', '', 'Restricted recovery pilot');
        await assert.rejects(auth.validateAccessToken(session.token), e => e.getStatus() === 401);
        const next = await auth.login(username, 'RecoveredPassword123!', '', 'Restricted MFA pilot');
        assert.equal(next.mfaRequired, true);
        assert.equal(next.enrollment, false);
        assert.equal(next.token, undefined);
      });
    } finally {
      try {
        await client.query('rollback');
        if (role) assert.equal((await client.query('select 1 from pg_roles where rolname=$1', [role])).rowCount, 0);
      } finally { await client.end(); }
    }
  });
