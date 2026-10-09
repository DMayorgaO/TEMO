const assert = require('node:assert/strict');
const test = require('node:test');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');

test('branches: rejects unsupported roles before querying', async () => {
  let queries = 0;
  const controller = new CatalogsController({ query: async () => { queries++; return { rows: [] }; } }, {});
  await assert.rejects(controller.sucursales({ user: { id: 'unknown', roleCode: 'OTHER' } }), error => error.getStatus() === 403);
  assert.equal(queries, 0);
});

for (const method of ['roles', 'usuarios', 'reglasComisiones', 'auditoria']) {
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

test('audit: returns bounded metadata without operation payloads or secrets', async () => {
  let statement;
  const expected = [{ id: 'event', accion: 'MFA_VERIFICADO' }];
  const controller = new CatalogsController({ query: async sql => { statement = sql; return { rows: expected }; } }, {});
  assert.deepEqual(await controller.auditoria({ user: { roleCode: 'JEFA' } }), expected.map(row => ({ ...row, navegador: 'No registrado' })));
  assert.match(statement, /limit 500/i);
  assert.match(statement, /order by b.fecha_creacion desc, b.id_bitacora desc/i);
  assert.doesNotMatch(statement, /datos_nuevos|datos_anteriores|contrasena|select\s+\*/i);
  assert.match(statement, /numero_auditoria/);
  assert.match(statement, /left\(coalesce\(b.agente_usuario, ''\), 300\)/);
  await assert.rejects(controller.auditoria({ user: { roleCode: 'TRANSFERISTA' } }), error => error.getStatus() === 403);
});

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
    const auditRows = await controller.auditoria({ user: { roleCode: 'JEFA' } });
    assert.ok(auditRows.length <= 500);
    assert.ok(auditRows.every(row => Number(row.numero) > 0 && typeof row.navegador === 'string'));
    if (auditRows.length) {
      const detail = await controller.auditDetail(auditRows[0].id, { user: { roleCode: 'JEFA' } });
      assert.ok(Array.isArray(detail.changes));
      assert.equal(typeof detail.hasBefore, 'boolean');
      assert.ok(!Object.prototype.hasOwnProperty.call(detail, 'datos_nuevos'));
    }
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
      const branches = await controller.sucursales({ user: { id: user.id, roleCode: 'CAJERO' } });
      const authorizedBranches = await client.query(`select s.id_sucursal as id from temo.sucursales s
        where s.estado='ACTIVO' and (exists(select 1 from temo.usuarios_sucursales a where a.id_sucursal=s.id_sucursal and a.id_usuario=$1)
          or exists(select 1 from temo.turnos t where t.id_sucursal=s.id_sucursal and t.id_cajero=$1 and t.estado in ('ABIERTO','PENDIENTE_APROBACION')))`, [user.id]);
      assert.deepEqual(branches.map(row=>row.id).sort(), authorizedBranches.rows.map(row=>row.id).sort());
      assert.ok(branches.every(row=>['cajeros','cajero_ids','cuentas','cuenta_ids'].every(field=>row[field]==='')));
      const branchIds = new Set(authorizedBranches.rows.map(row=>row.id));
      assert.ok(accounts.every(row=>row.sucursal_ids.split(', ').filter(Boolean).every(id=>branchIds.has(id))));
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
  const { Client } = require('pg');
  const { randomUUID, randomBytes, createHash } = require('node:crypto');
  const { TOTP } = require('otpauth');
  const { MfaSecretVault } = require('../dist/modules/auth/mfa-secret-vault');
  const mfaKey = randomBytes(32).toString('base64');
  const database = new Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview' });
  await database.connect();
  const adminUsername = `mfa_http_${randomUUID().replaceAll('-', '')}`;
  const adminId = (await database.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
    select id_rol,'MFA','TEST',$1,crypt($2,gen_salt('bf',4)),false from temo.roles where codigo='JEFA' returning id_usuario`,
  [adminUsername, 'TemoPruebas2026!'])).rows[0].id_usuario;
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
      MFA_ENCRYPTION_KEY: mfaKey,
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
    const health = await fetch(`${base}/health`);
    assert.ok(health.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.equal(health.headers.get('x-frame-options'), 'DENY');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    const routes = ['usuarios', 'roles', 'reglas-comisiones', 'cuentas-bancarias', 'sucursales'];
    for (const route of routes) assert.equal((await fetch(`${base}/catalogs/${route}`)).status, 401);
    for (const route of ['transactions/export', 'shifts/export', 'catalogs/export/users', 'shifts/dashboard/export']) {
      assert.equal((await fetch(`${base}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    }
    for (const username of ['cajero.pruebas', adminUsername]) {
      const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'TemoPruebas2026!' }) });
      assert.ok(login.ok);
      let session = await login.json();
      if (session.mfaRequired) {
        assert.equal(session.token, undefined);
        assert.equal((await fetch(`${base}/catalogs/usuarios`, { headers: { Authorization: `Bearer ${session.challenge}` } })).status, 401);
        const row = (await database.query(`select secreto_cifrado from temo.desafios_mfa where token_hash=$1`,
          [createHash('sha256').update(session.challenge).digest('hex')])).rows[0];
        const secret = new MfaSecretVault(mfaKey).decrypt(adminId, row.secreto_cifrado);
        const checked = await fetch(`${base}/auth/mfa/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge: session.challenge, code: new TOTP({ secret }).generate() }) });
        assert.equal(checked.status, 201);
        session = await checked.json();
        assert.equal(session.recoveryCodes.length, 8);
        const challenges = [];
        for (let index = 0; index < 2; index++) {
          const loginAgain = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: 'TemoPruebas2026!' }) });
          challenges.push((await loginAgain.json()).challenge);
        }
        const concurrent = await Promise.all(challenges.map(challenge => fetch(`${base}/auth/mfa/verify`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge, recoveryCode: session.recoveryCodes[1] }),
        })));
        assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 401]);
      }
      const token = session.token ?? session.accessToken;
      assert.ok(token);
      const headers = { Authorization: `Bearer ${token}` };
      const exportHeaders = { ...headers, 'Content-Type': 'application/json' };
      for (const resource of ['transactions', 'shifts']) {
        const selection = (await (await fetch(`${base}/${resource}`, { headers })).json()).slice(0, 2);
        const dataset = await fetch(`${base}/${resource}/export`, { method: 'POST', headers: exportHeaders,
          body: JSON.stringify({ format: 'EXCEL', ids: selection.map(row => row.database_id) }) });
        assert.equal(dataset.status, 201);
        assert.equal(dataset.headers.get('cache-control'), 'no-store');
        assert.equal((await dataset.json()).length, selection.length);
      }
      const usersExport = await fetch(`${base}/catalogs/export/users`, { method: 'POST', headers: exportHeaders,
        body: JSON.stringify({ format: 'PDF', ids: [adminId] }) });
      assert.equal(usersExport.status, username === 'cajero.pruebas' ? 403 : 201);
      if (usersExport.ok) assert.ok(!(await usersExport.text()).includes('contrasena'));
      const pngExport = await fetch(`${base}/shifts/dashboard/export`, { method: 'POST', headers: exportHeaders, body: '{}' });
      assert.equal(pngExport.status, username === 'cajero.pruebas' ? 403 : 201);
      const verified = (await database.query(`select datos_nuevos from temo.bitacora b join temo.usuarios u using(id_usuario)
        where u.usuario=$1 and datos_nuevos->>'evento'='EXPORTACION_AUTORIZADA' order by numero_auditoria desc limit 1`, [username])).rows[0];
      assert.equal(typeof verified.datos_nuevos.filas_verificadas, 'number');
      const exportSection = username === 'cajero.pruebas' ? 'Transacciones' : 'Auditoria';
      const exported = await fetch(`${base}/catalogs/auditoria/exportaciones`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: exportSection, format: 'PDF', rows: 3 }) });
      assert.equal(exported.status, 201);
      assert.equal((await exported.json()).recorded, true);
      const exportEvent = (await database.query(`select b.accion,b.datos_nuevos from temo.bitacora b join temo.usuarios u using(id_usuario)
        where u.usuario=$1 and b.datos_nuevos->>'evento'='EXPORTACION_SOLICITADA' order by b.numero_auditoria desc limit 1`, [username])).rows[0];
      assert.equal(exportEvent.accion, 'EXPORTAR');
      assert.equal(exportEvent.datos_nuevos.apartado, exportSection);
      assert.equal(exportEvent.datos_nuevos.filas_declaradas, 3);
      for (const route of routes) {
        const response = await fetch(`${base}/catalogs/${route}`, { headers });
        assert.equal(response.status, username === 'cajero.pruebas' && !['cuentas-bancarias','sucursales'].includes(route) ? 403 : 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        if (username === 'cajero.pruebas' && route === 'cuentas-bancarias') {
          assert.ok((await response.json()).every((row) => row.numero_cuenta === ''));
        }
      }
      const allowedOrigin = await fetch(`${base}/catalogs/cuentas-bancarias`, { headers: { ...headers, Origin: 'http://127.0.0.1:3187' } });
      if (username === 'cajero.pruebas') {
        const denied = await database.query(`select b.datos_nuevos from temo.bitacora b join temo.usuarios u using(id_usuario)
          where u.usuario=$1 and b.tabla='seguridad' and b.datos_nuevos->>'evento'='ACCESO_DENEGADO'
          and b.datos_nuevos->>'ruta'='/api/catalogs/usuarios' order by b.fecha_creacion desc limit 1`, [username]);
        assert.equal(denied.rows.length, 1);
        assert.equal(denied.rows[0].datos_nuevos.metodo, 'GET');
        const reads = await database.query(`select b.accion,b.datos_nuevos from temo.bitacora b join temo.usuarios u using(id_usuario)
          where u.usuario=$1 and b.tabla='seguridad' and b.datos_nuevos->>'evento'='LECTURA_SENSIBLE'
          and b.datos_nuevos->>'ruta'='/api/catalogs/cuentas-bancarias' order by b.fecha_creacion desc limit 1`, [username]);
        assert.equal(reads.rows.length, 1);
        assert.equal(reads.rows[0].accion, 'CONSULTAR');
        assert.equal(reads.rows[0].datos_nuevos.metodo, 'GET');
      }
      assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3187');
      const foreignOrigin = await fetch(`${base}/catalogs/cuentas-bancarias`, { headers: { ...headers, Origin: 'https://untrusted.invalid' } });
      assert.equal(foreignOrigin.headers.get('access-control-allow-origin'), null);
      const revoked = await fetch(`${base}/catalogs/usuarios/${adminId}/revoke-sessions`, {
        method: 'POST', headers: exportHeaders, body: '{}',
      });
      assert.equal(revoked.status, username === 'cajero.pruebas' ? 403 : 201);
      if (username === adminUsername) {
        assert.equal((await fetch(`${base}/auth/me`, { headers })).status, 401);
        const event = (await database.query(`select datos_nuevos from temo.bitacora
          where id_registro=$1 and datos_nuevos->>'evento'='REVOCAR_SESIONES'`, [adminId])).rows[0];
        assert.equal(event.datos_nuevos.evento, 'REVOCAR_SESIONES');
      }
    }
  } finally {
    if (child.exitCode === null) child.kill();
    await exited;
    await database.query(`delete from temo.bitacora where id_usuario=$1`, [adminId]);
    await database.query(`delete from temo.usuarios where id_usuario=$1`, [adminId]);
    await database.end();
  }
});
