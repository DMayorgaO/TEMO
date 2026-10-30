const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { CatalogsService } = require('../dist/modules/catalogs/catalogs.service');
const options = { connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview', options: '-c search_path=temo,extensions,public' };
const forbidden = error => error.getStatus() === 403;
const actions = (service, actor, target) => [
  ...['users', 'roles', 'banks', 'branches', 'accounts', 'movements', 'commissions']
    .map(resource => () => service.save(resource, undefined, {}, actor)),
  () => service.resetUserPassword(target, 'TemporaryPassword123!', actor, '', ''),
  () => service.revokeUserSessions(target, actor),
];

test('all administrative writes reject missing or malformed session versions before SQL', async () => {
  const service = new CatalogsService({ transaction: work => work({ query: () => assert.fail('invalid actor reached SQL') }) });
  for (const sessionVersion of [undefined, null, -1, 1.5, '1', NaN, Infinity, 2147483648]) {
    for (const act of actions(service, { id: randomUUID(), roleCode: 'JEFA', sessionVersion }, randomUUID())) {
      await assert.rejects(act(), forbidden);
    }
  }
  for (const roleCode of ['CAJERO', 'TRANSFERISTA', 'CUSTOM', 'JEFA']) {
    for (const act of actions(service, { id: randomUUID(), roleCode, sessionVersion: 1, mustChangePassword: true }, randomUUID())) {
      await assert.rejects(act(), forbidden);
    }
  }
});

test('administrative writes revalidate stored identity before mutations', { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
  const c = new Client(options); await c.connect(); await c.query('begin');
  let serial = 0;
  const db = { transaction: async work => {
    const name = 'catalog_session_' + ++serial;
    await c.query('savepoint ' + name);
    try { const result = await work(c); await c.query('release savepoint ' + name); return result; }
    catch (error) { await c.query('rollback to savepoint ' + name); await c.query('release savepoint ' + name); throw error; }
  } };
  const service = new CatalogsService(db);
  try {
    if (process.env.TEMO_TEST_RESTRICTED_ROLE === '1') await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
    const actor = (await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
      select id_rol,'Session','QA',$1,'not-a-login-credential',false from temo.roles where codigo='JEFA'
      returning id_usuario as id,version_sesion as "sessionVersion"`, ['catalog_session_' + randomUUID().replaceAll('-', '')])).rows[0];
    actor.roleCode = 'JEFA';
    const original = (await c.query('select id_rol from temo.usuarios where id_usuario=$1', [actor.id])).rows[0].id_rol;
    const count = async () => (await c.query('select count(*)::int n from temo.bitacora where id_usuario=$1', [actor.id])).rows[0].n;
    const scenarios = [
      ['revoked session', 'version_sesion=version_sesion+1'],
      ['inactive user', "estado='INACTIVO'"],
      ['blocked user', "estado='BLOQUEADO'"],
      ['mandatory password change', 'debe_cambiar_contrasena=true'],
      ['changed role', "id_rol=(select id_rol from temo.roles where codigo='CAJERO')"],
    ];
    for (const [name, patch] of scenarios) await t.test(name, async () => {
      await c.query(`update temo.usuarios set ${patch} where id_usuario=$1`, [actor.id]);
      const before = await count();
      for (const act of actions(service, actor, randomUUID())) await assert.rejects(act(), forbidden);
      assert.equal(await count(), before);
      await c.query("update temo.usuarios set version_sesion=$2,estado='ACTIVO',debe_cambiar_contrasena=false,id_rol=$3 where id_usuario=$1", [actor.id, actor.sessionVersion, original]);
    });
    await t.test('inactive administrator role', async () => {
      await c.query("update temo.roles set estado='INACTIVO' where id_rol=$1", [original]);
      for (const act of actions(service, actor, randomUUID())) await assert.rejects(act(), forbidden);
      await c.query("update temo.roles set estado='ACTIVO' where id_rol=$1", [original]);
    });
    await t.test('valid save and self revocation remain possible; audit failure rolls back', async () => {
      const bank = await service.save('banks', undefined, { code: 'QASESS', name: 'QA Session' }, actor);
      const broken = new CatalogsService({ transaction: work => db.transaction(real => work({ query: (sql, args) => {
        if (sql.includes('insert into temo.bitacora')) throw new Error('audit unavailable');
        return real.query(sql, args);
      } })) });
      await assert.rejects(broken.revokeUserSessions(actor.id, actor), /audit unavailable/);
      assert.equal((await c.query('select version_sesion from temo.usuarios where id_usuario=$1', [actor.id])).rows[0].version_sesion, actor.sessionVersion);
      assert.ok(bank.id);
      await service.revokeUserSessions(actor.id, actor);
      await assert.rejects(service.save('banks', undefined, { code: 'STALE', name: 'Stale' }, actor), forbidden);
    });
  } finally { await c.query('rollback'); await c.end(); }
});

test('administrator identity lock serializes a concurrent revocation until the audited write finishes', { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
  const first = new Client(options), second = new Client(options);
  await first.connect(); await second.connect();
  let actor;
  try {
    actor = (await first.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
      select id_rol,'Concurrent','QA',$1,'not-a-login-credential',false from temo.roles where codigo='JEFA'
      returning id_usuario as id,version_sesion as "sessionVersion"`, ['catalog_lock_' + randomUUID().replaceAll('-', '')])).rows[0];
    actor.roleCode = 'JEFA';
    await first.query('begin');
    const service = new CatalogsService({ transaction: work => work(first) });
    const saved = await service.save('banks', undefined, { code: 'QALOCK', name: 'QA Lock' }, actor);
    assert.ok(saved.id);
    await second.query('begin'); await second.query("set local lock_timeout='150ms'");
    await assert.rejects(second.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1', [actor.id]), error => error.code === '55P03');
    await second.query('rollback');
    await second.query('begin'); await second.query("set local lock_timeout='150ms'");
    await assert.rejects(second.query(`update temo.roles set nombre=nombre where codigo='JEFA'`), error => error.code === '55P03');
    await second.query('rollback');
    await first.query('rollback');
    await second.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1', [actor.id]);
    await first.query('begin');
    await assert.rejects(service.save('banks', undefined, { code: 'STALE', name: 'Stale' }, actor), forbidden);
  } finally {
    await first.query('rollback'); await second.query('rollback');
    if (actor) await first.query('delete from temo.usuarios where id_usuario=$1', [actor.id]);
    await first.end(); await second.end();
  }
});

test('a revocation committed while catalog authorization waits is observed before any write', { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
  const first = new Client(options), second = new Client(options);
  await first.connect(); await second.connect();
  let actor, pending;
  try {
    actor = (await first.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
      select id_rol,'Waiting','QA',$1,'not-a-login-credential',false from temo.roles where codigo='JEFA'
      returning id_usuario as id,version_sesion as "sessionVersion"`, ['catalog_wait_' + randomUUID().replaceAll('-', '')])).rows[0];
    actor.roleCode = 'JEFA';
    await first.query('begin');
    await first.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1', [actor.id]);
    await second.query('begin'); await second.query("set local statement_timeout='5s'");
    const service = new CatalogsService({ transaction: work => work(second) });
    pending = assert.rejects(service.save('banks', undefined, { code: 'QAWAIT', name: 'Must not save' }, actor), forbidden);
    // Wait for PostgreSQL's actual lock wait, not an assumed timer ordering.
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await first.query("select wait_event_type from pg_stat_activity where pid=$1", [second.processID]);
      if (state.rows[0]?.wait_event_type === 'Lock') { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, 'authorization must reach the conflicting row lock');
    await first.query('commit');
    await pending;
    await second.query('rollback');
    assert.equal((await first.query('select count(*)::int n from temo.bitacora where id_usuario=$1', [actor.id])).rows[0].n, 0);
  } finally {
    await first.query('rollback');
    if (pending) await pending;
    await second.query('rollback');
    if (actor) await first.query('delete from temo.usuarios where id_usuario=$1', [actor.id]);
    await first.end(); await second.end();
  }
});
