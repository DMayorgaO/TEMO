const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDatabaseOptions } = require('../dist/config/database.config');
const { DatabaseService } = require('../dist/modules/database/database.service');
const { inspectDatabasePrivileges } = require('../dist/modules/database/database-security');
const settings = { APP_ENV: 'development', DATABASE_URL: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview', DATABASE_SSL: 'false' };
const config = overrides => ({ get: (key, fallback) => ({ ...settings, ...overrides })[key] ?? fallback });

test('database options bound resources, explicitly disable local TLS and verify remote certificates', () => {
  const local = buildDatabaseOptions(config());
  assert.equal(local.max, 10);
  assert.equal(local.connectionTimeoutMillis, 10000);
  assert.equal(local.statement_timeout, 60000);
  assert.equal(local.lock_timeout, 10000);
  assert.equal(local.idle_in_transaction_session_timeout, 60000);
  assert.equal(local.ssl, false);
  const remote = buildDatabaseOptions(config({ APP_ENV: 'production', DATABASE_SSL: 'true' }));
  assert.equal(remote.ssl.rejectUnauthorized, true);
  assert.throws(() => buildDatabaseOptions(config({ APP_ENV: 'production' })));
});

test('connection-string overrides, invalid limits and certificate sources fail without revealing inputs', () => {
  for (const suffix of ['?sslmode=no-verify', '?sslmode=disable', '?options=secret', '?statement_timeout=0', '#secret']) {
    assert.throws(() => buildDatabaseOptions(config({ DATABASE_URL: settings.DATABASE_URL + suffix })), e => !e.message.includes('secret'));
  }
  for (const key of ['DATABASE_POOL_MAX', 'DATABASE_CONNECT_TIMEOUT_MS', 'DATABASE_STATEMENT_TIMEOUT_MS',
    'DATABASE_LOCK_TIMEOUT_MS', 'DATABASE_IDLE_TRANSACTION_TIMEOUT_MS']) {
    for (const value of ['0', '-1', '1.5', 'NaN', '9999999', '']) {
      assert.throws(() => buildDatabaseOptions(config({ [key]: value })));
    }
  }
  for (const overrides of [{ DATABASE_SSL_CA_PATH: 'secret-path', DATABASE_SSL_CA_BASE64: 'secret' },
    { DATABASE_SSL_CA_BASE64: 'not base64' }, { DATABASE_SSL_CA_PATH: 'nonexistent-secret-certificate' },
    { DATABASE_SSL_CA_BASE64: Buffer.from('not a certificate').toString('base64') }]) {
    assert.throws(() => buildDatabaseOptions(config({ DATABASE_SSL: 'true', ...overrides })), e => !e.message.includes('secret'));
  }
});

test('transaction preserves original errors, destroys failed rollback connections and never retries writes', async () => {
  const service = new DatabaseService(config());
  await service.pool.end();
  let releases = [];
  let statements = [];
  const failure = new Error('private-original-failure');
  service.pool = { connect: async () => ({ on: () => {}, removeListener: () => {}, query: async sql => {
    statements.push(sql);
    if (sql === 'ROLLBACK') throw new Error('private-rollback-failure');
  }, release: discard => releases.push(discard) }) };
  await assert.rejects(service.transaction(async () => { throw failure; }), error => error === failure);
  assert.deepEqual(statements, ['BEGIN', 'ROLLBACK']);
  assert.deepEqual(releases, [true]);
  releases = []; statements = [];
  service.pool = { connect: async () => ({ on: () => {}, removeListener: () => {}, query: async sql => { statements.push(sql); },
    release: discard => releases.push(discard) }) };
  assert.equal(await service.transaction(async () => 'ok'), 'ok');
  assert.deepEqual(statements, ['BEGIN', 'COMMIT']);
  assert.deepEqual(releases, [false]);
});

test('privilege screening exposes flags only and identifies excessive API capabilities', async () => {
  const safe = { superuser: false, bypass_rls: false, administrative: false, privileged_membership: false,
    database_create: false, schema_create: false, owned_objects: 0, data_api_schema_access: false,
    truncate_tables: false, create_triggers: false, audit_mutation: false, callable_definer: false, migration_mutation: false };
  let query;
  const inspect = row => inspectDatabasePrivileges({ query: async sql => { query = sql; return { rows: [row] }; } });
  assert.equal((await inspect(safe)).suitableForRestrictedApi, true);
  for (const key of Object.keys(safe)) {
    const report = await inspect({ ...safe, [key]: key === 'owned_objects' ? 1 : true });
    assert.equal(report.suitableForRestrictedApi, false);
    assert.deepEqual(report.blockers, [key]);
  }
  assert.ok(!query.includes('from temo.'));
  assert.ok(!JSON.stringify(await inspect({ ...safe, password: 'secret' })).includes('secret'));
});

test('preview: statement cancellation and lock timeout roll back writes and leave the pool usable',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const service = new DatabaseService(config({ DATABASE_STATEMENT_TIMEOUT_MS: '1000', DATABASE_LOCK_TIMEOUT_MS: '1000' }));
    const { Client } = require('pg');
    const locker = new Client(buildDatabaseOptions(config()));
    await locker.connect();
    try {
      await assert.rejects(service.transaction(async client => {
        await client.query('create table public.resilience_rollback_fixture(value integer)');
        await client.query('select pg_sleep(2)');
      }), error => error.code === '57014');
      assert.equal((await service.query("select to_regclass('public.resilience_rollback_fixture') as fixture")).rows[0].fixture, null);
      await locker.query('begin');
      await locker.query('select pg_advisory_xact_lock(741260899)');
      await assert.rejects(service.transaction(async client => {
        await client.query("set local statement_timeout='3s'");
        return client.query('select pg_advisory_xact_lock(741260899)');
      }),
        error => error.code === '55P03');
      await locker.query('rollback');
      assert.equal((await service.query('select 1 as healthy')).rows[0].healthy, 1);
      await service.transaction(async client => {
        assert.equal((await client.query('show statement_timeout')).rows[0].statement_timeout, '1s');
        assert.equal((await client.query('show lock_timeout')).rows[0].lock_timeout, '1s');
      });
    } finally { await locker.end(); await service.onModuleDestroy(); }
  });

test('preview: saturated pool acquisition expires and recovers after releasing its connection',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const service = new DatabaseService(config({ DATABASE_POOL_MAX: '1', DATABASE_CONNECT_TIMEOUT_MS: '1000' }));
    let held;
    try {
      held = await service.pool.connect();
      await assert.rejects(service.query('select 1'), /timeout/i);
      held.release(); held = null;
      assert.equal((await service.query('select 1 as healthy')).rows[0].healthy, 1);
    } finally { if (held) held.release(); await service.onModuleDestroy(); }
  });

test('preview: abandoned transaction is terminated without crashing and its connection is discarded',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const service = new DatabaseService(config({ DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: '1000' }));
    const messages = [];
    service.logger.warn = message => messages.push(message);
    try {
      await assert.rejects(service.transaction(async client => {
        await client.query('select 1');
        await new Promise(resolve => setTimeout(resolve, 1600));
        await client.query('select 2');
      }));
      assert.ok(messages.length > 0);
      assert.equal((await service.query('select 1 as healthy')).rows[0].healthy, 1);
    } finally { await service.onModuleDestroy(); }
  });

test('preview: idle connection failure is handled without raw logging and subsequent queries reconnect',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const service = new DatabaseService(config());
    const messages = [];
    service.logger.warn = message => messages.push(message);
    const { Client } = require('pg');
    const supervisor = new Client(buildDatabaseOptions(config()));
    await supervisor.connect();
    try {
      const pid = (await service.query('select pg_backend_pid() as pid')).rows[0].pid;
      const idleError = new Promise(resolve => service.pool.once('error', resolve));
      await supervisor.query('select pg_terminate_backend($1)', [pid]);
      await Promise.race([idleError, new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('idle error not observed')), 3000); timer.unref();
      })]);
      assert.equal(messages.length, 1);
      assert.ok(!messages[0].includes(String(pid)));
      assert.equal((await service.query('select 1 as healthy')).rows[0].healthy, 1);
    } finally { await supervisor.end(); await service.onModuleDestroy(); }
  });
