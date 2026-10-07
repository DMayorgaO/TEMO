const assert = require('node:assert/strict');
const test = require('node:test');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');

for (const method of ['roles', 'usuarios', 'reglasComisiones']) {
  test(`${method}: denies cashier and unknown roles before querying`, async () => {
    let queries = 0;
    const controller = new CatalogsController({ query: async () => { queries++; return { rows: [] }; } }, {});
    for (const roleCode of ['CAJERO', 'OTHER']) {
      await assert.rejects(controller[method]({ user: { roleCode } }), (error) => error.getStatus() === 403);
    }
    assert.equal(queries, 0);
    await controller[method]({ user: { roleCode: 'JEFA' } });
    assert.equal(queries, 1);
  });
}

test('accounts: binds identity and administrator flag, denies unsupported roles', async () => {
  const calls = [];
  const controller = new CatalogsController({ query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } }, {});
  await controller.cuentasBancarias({ user: { id: 'cashier-id', roleCode: 'CAJERO' } });
  assert.deepEqual(calls[0].params, [false, 'cashier-id', false]);
  assert.ok(calls[0].sql.includes('assignment.id_usuario = $2::uuid'));
  assert.ok(calls[0].sql.includes("else '' end as numero_cuenta"));
  await controller.cuentasBancarias({ user: { id: 'admin-id', roleCode: 'JEFA' } });
  assert.deepEqual(calls[1].params, [true, 'admin-id', false]);
  await controller.cuentasBancarias({ user: { id: 'operator-id', roleCode: 'TRANSFERISTA' } });
  assert.deepEqual(calls[2].params, [false, 'operator-id', true]);
  await assert.rejects(controller.cuentasBancarias({ user: { roleCode: 'OTHER' } }), (error) => error.getStatus() === 403);
  assert.equal(calls.length, 3);
});

test('preview database: scoped accounts match independently authorized accounts', { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
  const { Client } = require('pg');
  // Fixed local preview database: never use production environment credentials.
  const client = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview' });
  await client.connect();
  try {
    await client.query('begin read only');
    const users = await client.query("select u.id_usuario as id from temo.usuarios u join temo.roles r using (id_rol) where r.codigo='CAJERO'");
    assert.ok(users.rows.length > 0);
    const controller = new CatalogsController(client, {});
    for (const user of users.rows) {
      const accounts = await controller.cuentasBancarias({ user: { id: user.id, roleCode: 'CAJERO' } });
      const allowed = await client.query(`select c.id_cuenta as id from temo.cuentas_bancarias c
        join temo.entidades_bancarias e using (id_entidad) join temo.monedas m using (id_moneda)
        where c.estado='ACTIVO' and e.estado='ACTIVO' and m.estado='ACTIVO' and (
          not exists(select 1 from temo.cuentas_sucursales cs where cs.id_cuenta=c.id_cuenta)
          or c.id_cuenta in (select cs.id_cuenta from temo.cuentas_sucursales cs
            join temo.sucursales s using (id_sucursal) where s.estado='ACTIVO' and cs.id_sucursal in (
              select id_sucursal from temo.usuarios_sucursales where id_usuario=$1
              union select id_sucursal from temo.turnos where id_cajero=$1 and estado in ('ABIERTO','PENDIENTE_APROBACION'))))`, [user.id]);
      assert.deepEqual(accounts.map((row) => row.id).sort(), allowed.rows.map((row) => row.id).sort());
      assert.ok(accounts.every((row) => row.numero_cuenta === ''));
    }
    const admin = await controller.cuentasBancarias({ user: { id: users.rows[0].id, roleCode: 'JEFA' } });
    const total = await client.query('select count(*)::int as total from temo.cuentas_bancarias');
    assert.equal(admin.length, total.rows[0].total);
    const operator = await controller.cuentasBancarias({ user: { id: users.rows[0].id, roleCode: 'TRANSFERISTA' } });
    const active = await client.query("select count(*)::int as total from temo.cuentas_bancarias c join temo.entidades_bancarias e using(id_entidad) join temo.monedas m using(id_moneda) where c.estado='ACTIVO' and e.estado='ACTIVO' and m.estado='ACTIVO'");
    assert.equal(operator.length, active.rows[0].total);
    assert.ok(operator.every((row) => row.numero_cuenta === ''));
  } finally {
    await client.query('rollback');
    await client.end();
  }
});

test('HTTP: anonymous is denied, cashier restricted, administrator allowed', { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
  const { spawn } = require('node:child_process');
  const { once } = require('node:events');
  const { createServer } = require('node:net');
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const child = spawn(process.execPath, [require.resolve('../dist/main.js')], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env,
      DATABASE_URL: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview',
      DATABASE_SSL: 'false', DATABASE_SSL_CA_PATH: '', DATABASE_SSL_CA_BASE64: '',
      PORT: String(port), BACKEND_PORT: String(port), APP_ENV: 'development',
      AUTH_SECRET: 'isolated-catalog-security-test-secret-2026', CORS_ORIGINS: 'http://127.0.0.1:3187',
    },
  });
  const exited = once(child, 'exit');
  const base = `http://127.0.0.1:${port}/api`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'isolated local API must start');
    const routes = ['usuarios', 'roles', 'reglas-comisiones', 'cuentas-bancarias'];
    for (const route of routes) assert.equal((await fetch(`${base}/catalogs/${route}`)).status, 401);
    for (const username of ['cajero.pruebas', 'admin.pruebas']) {
      const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'TemoPruebas2026!' }) });
      assert.ok(login.ok);
      const session = await login.json();
      const token = session.token ?? session.accessToken;
      assert.ok(token);
      const headers = { Authorization: `Bearer ${token}` };
      for (const route of routes) {
        const response = await fetch(`${base}/catalogs/${route}`, { headers });
        assert.equal(response.status, username === 'cajero.pruebas' && route !== 'cuentas-bancarias' ? 403 : 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        if (username === 'cajero.pruebas' && route === 'cuentas-bancarias') {
          assert.ok((await response.json()).every((row) => row.numero_cuenta === ''));
        }
      }
      const allowedOrigin = await fetch(`${base}/catalogs/cuentas-bancarias`, { headers: { ...headers, Origin: 'http://127.0.0.1:3187' } });
      assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3187');
      const foreignOrigin = await fetch(`${base}/catalogs/cuentas-bancarias`, { headers: { ...headers, Origin: 'https://untrusted.invalid' } });
      assert.equal(foreignOrigin.headers.get('access-control-allow-origin'), null);
    }
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
  }
});
