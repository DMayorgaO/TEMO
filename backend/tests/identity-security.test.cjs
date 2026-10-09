const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { CatalogsService } = require('../dist/modules/catalogs/catalogs.service');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { AuthGuard } = require('../dist/modules/auth/auth.guard');
const { auditChanges } = require('../dist/modules/catalogs/audit-changes');

const context = request => ({ getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => request }) });
test('guard enforces exact password-change routes and rejects ambiguous bearer headers', async () => {
  let validations = 0;
  const auth = { validateAccessToken: async () => { validations++; return { roleCode: 'CAJERO', mustChangePassword: true }; } };
  const guard = new AuthGuard({ getAllAndOverride: () => false }, auth);
  const base = { headers: { authorization: 'Bearer valid.token.signature' }, method: 'GET', route: { path: '/api/auth/me' } };
  assert.equal(await guard.canActivate(context(base)), true);
  for (const path of ['/api/auth/me/extra', '/api/auth/change-password-extra', '/api/transactions']) {
    await assert.rejects(guard.canActivate(context({ ...base, route: { path } })), e => e.getStatus() === 403);
  }
  assert.equal(await guard.canActivate(context({ ...base, method: 'POST', route: { path: '/api/auth/logout' } })), true);
  assert.equal(await guard.canActivate(context({ ...base, method: 'POST', route: { path: '/api/auth/change-password' } })), true);
  const previous = validations;
  for (const authorization of ['Bearer good extra', 'Bearer', 'Bearer  two', 'Bearer good\n', 'Basic good']) {
    await assert.rejects(guard.canActivate(context({ ...base, headers: { authorization } })), e => e.getStatus() === 401);
  }
  assert.equal(validations, previous);
});

test('roles without an operational policy fail closed; public endpoints remain public', async () => {
  const guard = new AuthGuard({ getAllAndOverride: () => false }, { validateAccessToken: async () => ({ roleCode: 'CUSTOM' }) });
  await assert.rejects(guard.canActivate(context({ headers: { authorization: 'Bearer valid' }, method: 'GET', route: { path: '/api/directory' } })), e => e.getStatus() === 403);
  assert.equal(await new AuthGuard({ getAllAndOverride: () => true }, {}).canActivate(context({})), true);
});

test('identity changes reject cashier before database and invalid status instead of reactivating', async () => {
  let queries = 0;
  const service = new CatalogsService({ transaction: async () => { queries++; } });
  await assert.rejects(service.save('users', undefined, {}, { roleCode: 'CAJERO' }), e => e.getStatus() === 403);
  for (const payload of [null, [], { status: 'typo' }, { firstName: {} }, { password: ['secret'] }]) {
    await assert.rejects(service.save('users', undefined, payload, { roleCode: 'JEFA' }), e => e.getStatus() === 400);
  }
  assert.equal(queries, 0);
});

test('last active administrator cannot be removed even with a stale actor snapshot', async () => {
  const service = new CatalogsService({});
  const client = { query: async sql => sql.includes('select codigo') ? { rows: [{ codigo: 'CAJERO' }] }
    : sql.includes('select id_rol') ? { rows: [{ id: randomUUID() }] } : { rows: [], rowCount: 0 } };
  await assert.rejects(service.saveUser(client, randomUUID(), { firstName: 'Admin', username: 'Admin', role: 'CAJERO', status: 'Inactivo' },
    { id: randomUUID() }, { rol: 'JEFA', estado: 'ACTIVO' }), e => e.getStatus() === 400 && /Administrador activo/.test(e.message));
});

test('identity audit exposes permitted changes, never secret fields', () => {
  const result = auditChanges('usuarios', { rol: 'CAJERO', estado: 'ACTIVO', contrasena_hash: 'hidden' },
    { rol: 'JEFA', estado: 'INACTIVO', password: 'hidden', secreto_cifrado: 'hidden' });
  assert.deepEqual(result.changes.map(c => c.field), ['Rol', 'Estado']);
  assert.ok(!JSON.stringify(result).includes('hidden'));
});

test('password change refuses role/version drift rather than minting an MFA administrator token', async () => {
  const actor = { id: randomUUID(), roleCode: 'CAJERO', sessionVersion: 3 };
  const calls = [];
  const db = { transaction: async work => work({ query: async (sql, params) => {
    calls.push([sql, params]); return { rows: sql.includes('returning') ? [{ id: actor.id, username: 'TEST' }] : [] };
  } }) };
  const auth = new AuthService(db, { get: (key, fallback) => key === 'AUTH_SECRET' ? 'isolated-identity-security-secret-2026' : fallback });
  auth.loadUser = async () => ({ ...actor, roleCode: 'JEFA', sessionVersion: 5 });
  await assert.rejects(auth.changePassword(actor, 'OldPassword123!', 'NewPassword123!', '', ''), e => e.getStatus() === 401);
  assert.deepEqual(calls[1][1], [actor.id, 'OldPassword123!', 'NewPassword123!', 3, 'CAJERO']);
  assert.match(calls[1][0], /version_sesion = \$4/);
});

test('password recovery refuses ambiguous identities without sending or changing anything', async () => {
  const rows = [{ id: randomUUID() }, { id: randomUUID() }];
  let calls = 0;
  const db = { query: async () => { calls++; return { rows }; }, transaction: async work => work({
    query: async sql => { calls++; return { rows: sql.includes('pg_advisory') ? [] : rows }; },
  }) };
  const auth = new AuthService(db, { get: (key, fallback) => key === 'AUTH_SECRET' ? 'isolated-identity-security-secret-2026' : fallback });
  auth.sendRecoveryEmail = async () => assert.fail('ambiguous identity must never receive a code');
  assert.equal((await auth.requestPasswordRecovery('ambiguous', '', '')).success, true);
  assert.equal(calls, 1);
  await assert.rejects(auth.confirmPasswordRecovery('ambiguous', '123456', 'NewPassword123!', '', ''), e => e.getStatus() === 400);
  assert.equal(calls, 3);
});

test('preview identity lifecycle: role/status revoke tokens, audit is atomic and protected roles survive', { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview', options: '-c search_path=temo,extensions,public' });
  await client.connect();
  try {
    await client.query('begin');
    let index = 0;
    const db = { query: (sql, args) => client.query(sql, args), transaction: async work => {
      const name = `identity_${++index}`;
      await client.query(`savepoint ${name}`);
      try { const value = await work(client); await client.query(`release savepoint ${name}`); return value; }
      catch (error) { await client.query(`rollback to savepoint ${name}`); throw error; }
    } };
    const roles = (await client.query("select id_rol,codigo,nombre,estado,descripcion from temo.roles where codigo in('JEFA','CAJERO','TRANSFERISTA')")).rows;
    const role = code => roles.find(r => r.codigo === code);
    const username = `identity_${randomUUID().replaceAll('-', '')}`;
    const admin = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
      values($1,'Identity','Admin',$2,crypt('InitialPassword123!',gen_salt('bf',4)),false) returning id_usuario as id,version_sesion as "sessionVersion"`,
    [role('JEFA').id_rol, `${username}_admin`])).rows[0];
    admin.roleCode = 'JEFA';
    const catalogs = new CatalogsService(db);
    const auth = new AuthService(db, { get: (key, fallback) => key === 'AUTH_SECRET' ? 'isolated-identity-security-secret-2026' : fallback });
    const input = { firstName: 'Identity', lastName: 'Cashier', username, roleId: role('CAJERO').id_rol, password: 'InitialPassword123!', status: 'Activo' };
    const created = await catalogs.save('users', undefined, input, admin);
    const target = created.id;
    const edit = { ...input, password: '' };
    await t.test('case-insensitive usernames and emails cannot identify two accounts', async () => {
      await assert.rejects(catalogs.save('users', undefined, { ...input, username: username.toLowerCase() }, admin),
        e => e.getStatus() === 400 && /ya esta registrado/.test(e.message));
      const email = `${username}@example.invalid`;
      await catalogs.save('users', target, { ...edit, email }, admin);
      await assert.rejects(db.transaction(real => real.query(`insert into temo.usuarios
        (id_rol,nombres,apellidos,usuario,contrasena_hash) values($1,'Duplicate','Fixture',$2,'not-a-password')`,
      [role('CAJERO').id_rol, username.toLowerCase()])), e => e.code === '23505');
      await assert.rejects(catalogs.save('users', undefined, { ...input, username: `${username}_other`, email: email.toUpperCase() }, admin),
        e => e.getStatus() === 400 && /ya esta registrado/.test(e.message));
      await catalogs.save('users', target, edit, admin);
    });
    const session = await auth.login(username, input.password, '', 'Identity test');
    await t.test('cosmetic edit keeps session; promotion invalidates previous token and requires MFA', async () => {
      await catalogs.save('users', target, { ...edit, firstName: 'Updated' }, admin);
      await auth.validateAccessToken(session.token);
      await catalogs.save('users', target, { ...edit, roleId: role('JEFA').id_rol }, admin);
      await assert.rejects(auth.validateAccessToken(session.token), e => e.getStatus() === 401);
      await assert.rejects(catalogs.save('users', target, { ...edit, roleId: role('JEFA').id_rol, password: 'NewPassword123!' }, admin), e => e.getStatus() === 400);
      const audit = (await client.query("select datos_anteriores,datos_nuevos from temo.bitacora where tabla='usuarios' and id_registro=$1 order by numero_auditoria desc limit 1", [target])).rows[0];
      assert.equal(audit.datos_anteriores.rol, 'CAJERO'); assert.equal(audit.datos_nuevos.rol, 'JEFA');
      assert.ok(!/contrasena_hash|InitialPassword|secreto|token/.test(JSON.stringify(audit)));
      await catalogs.save('users', target, edit, admin);
      await assert.rejects(auth.validateAccessToken(session.token), e => e.getStatus() === 401);
    });
    await t.test('disable/reactivate cannot revive tokens; password reset is cashier-only', async () => {
      const current = await auth.login(username, input.password, '', 'Identity test');
      await catalogs.save('users', target, { ...edit, status: 'Inactivo' }, admin);
      await catalogs.save('users', target, edit, admin);
      await assert.rejects(auth.validateAccessToken(current.token), e => e.getStatus() === 401);
      await catalogs.resetUserPassword(target, 'TemporaryPassword123!', admin, '', 'Identity test');
      const reset = (await client.query('select debe_cambiar_contrasena from temo.usuarios where id_usuario=$1', [target])).rows[0];
      assert.equal(reset.debe_cambiar_contrasena, true);
      await assert.rejects(catalogs.resetUserPassword(admin.id, 'TemporaryPassword123!', admin, '', ''), e => e.getStatus() === 400);
    });
    await t.test('self demotion and core role changes are rejected; stale administrator cannot mutate', async () => {
      await assert.rejects(catalogs.save('users', admin.id, edit, admin), e => e.getStatus() === 400);
      for (const core of roles) {
        for (const patch of [{ code: 'OTHER' }, { status: 'Inactivo' }]) {
          await assert.rejects(catalogs.save('roles', core.id_rol, { code: core.codigo, name: core.nombre, status: 'Activo', ...patch }, admin), e => e.getStatus() === 400);
        }
      }
      await assert.rejects(catalogs.save('users', target, edit, { ...admin, sessionVersion: admin.sessionVersion + 1 }), e => e.getStatus() === 403);
    });
    await t.test('audit failure rolls back mutation; role creation and updates have safe before/after', async () => {
      const broken = new CatalogsService({ ...db, transaction: work => db.transaction(real => work({ query: (sql, args) => {
        if (sql.includes('insert into temo.bitacora')) throw new Error('audit unavailable');
        return real.query(sql, args);
      } })) });
      await assert.rejects(broken.save('users', target, { ...edit, firstName: 'Not saved' }, admin), /audit unavailable/);
      assert.notEqual((await client.query('select nombres from temo.usuarios where id_usuario=$1', [target])).rows[0].nombres, 'Not saved');
      const custom = await catalogs.save('roles', undefined, { code: username.toUpperCase().slice(0, 39), name: username, status: 'Activo' }, admin);
      await catalogs.save('roles', custom.id, { code: username.toUpperCase().slice(0, 39), name: `${username}_changed`, status: 'Activo' }, admin);
      const event = (await client.query("select datos_anteriores,datos_nuevos from temo.bitacora where tabla='roles' and id_registro=$1 order by numero_auditoria desc limit 1", [custom.id])).rows[0];
      assert.equal(event.datos_anteriores.nombre, username);
      assert.equal(event.datos_nuevos.nombre, `${username}_changed`);
    });
    await t.test('own password change returns valid token and rejects the previous one', async () => {
      const current = await auth.login(username, 'TemporaryPassword123!', '', 'Identity test');
      const changed = await auth.changePassword(current.user, 'TemporaryPassword123!', 'PermanentPassword123!', '', 'Identity test');
      await auth.validateAccessToken(changed.token);
      await assert.rejects(auth.validateAccessToken(current.token), e => e.getStatus() === 401);
    });
    await t.test('administrator revokes sessions without changing password; cashier cannot revoke', async () => {
      const current = await auth.login(username, 'PermanentPassword123!', '', 'Identity test');
      await assert.rejects(catalogs.revokeUserSessions(target, current.user), e => e.getStatus() === 403);
      await catalogs.revokeUserSessions(target, admin);
      await assert.rejects(auth.validateAccessToken(current.token), e => e.getStatus() === 401);
      const again = await auth.login(username, 'PermanentPassword123!', '', 'Identity test');
      await auth.validateAccessToken(again.token);
      const event = (await client.query("select datos_nuevos from temo.bitacora where id_registro=$1 and datos_nuevos->>'evento'='REVOCAR_SESIONES'", [target])).rows[0];
      assert.equal(event.datos_nuevos.usuario, username.toUpperCase());
    });
    await t.test('recovery consumes one code, persists failed attempts and increments session version', async () => {
      await client.query('update temo.usuarios set correo=$2 where id_usuario=$1', [admin.id, `${username}_admin@example.invalid`]);
      const recovery = (await client.query(`insert into temo.recuperaciones_contrasena(id_usuario,codigo_hash,vence_en)
        values($1,$2,now()+interval '10 minutes') returning id_recuperacion as id`,
      [admin.id, auth.hashRecoveryCode(admin.id, '123456')])).rows[0];
      await assert.rejects(auth.confirmPasswordRecovery(`${username}_admin`, '000000', 'RecoveredPassword123!', '', ''), e => e.getStatus() === 400);
      assert.equal((await client.query('select intentos from temo.recuperaciones_contrasena where id_recuperacion=$1', [recovery.id])).rows[0].intentos, 1);
      await auth.confirmPasswordRecovery(`${username}_admin`, '123456', 'RecoveredPassword123!', '', 'Identity test');
      const changed = (await client.query(`select version_sesion,contrasena_hash=crypt('RecoveredPassword123!',contrasena_hash) as valid
        from temo.usuarios where id_usuario=$1`, [admin.id])).rows[0];
      assert.equal(changed.version_sesion, admin.sessionVersion + 1);
      assert.equal(changed.valid, true);
      await assert.rejects(auth.confirmPasswordRecovery(`${username}_admin`, '123456', 'RecoveredAgain123!', '', ''), e => e.getStatus() === 400);
    });
  } finally { await client.query('rollback'); await client.end(); }
});
