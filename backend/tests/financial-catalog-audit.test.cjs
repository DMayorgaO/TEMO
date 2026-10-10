const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { CatalogsService } = require('../dist/modules/catalogs/catalogs.service');
const { auditChanges } = require('../dist/modules/catalogs/audit-changes');

test('financial catalog changes deny cashier, transfer operator and unknown roles before database work', async () => {
  let calls = 0;
  const service = new CatalogsService({ transaction: async () => { calls++; } });
  for (const roleCode of ['CAJERO', 'TRANSFERISTA', 'OTHER']) {
    for (const resource of ['banks', 'commissions', 'branches', 'accounts', 'movements']) {
      await assert.rejects(service.save(resource, undefined, {}, { roleCode }), e => e.getStatus() === 403);
    }
  }
  assert.equal(calls, 0);
});

test('bank and commission audit viewer exposes only approved fields, preserving absent/null distinction', () => {
  const changes = auditChanges('reglas_comisiones', { monto_fijo: '1.0000', rango_fin: null, contrasena: 'secret' },
    { monto_fijo: '2.0000', rango_fin: '100.0000', token: 'secret', payload: { private: 'secret' } });
  assert.deepEqual(changes.changes, [{ field: 'Monto fijo', before: '1.0000', after: '2.0000' },
    { field: 'Fin del rango', before: 'Sin valor', after: '100.0000' }]);
  assert.equal(JSON.stringify(changes).includes('secret'), false);
  assert.deepEqual(auditChanges('entidades_bancarias', null, { codigo: 'DEMO', estado: 'ACTIVO', password: 'secret' }).changes,
    [{ field: 'Codigo del banco', before: 'No registrado', after: 'DEMO' }, { field: 'Estado', before: 'No registrado', after: 'ACTIVO' }]);
});

test('nested catalog audit compares UUIDs rather than positions and refuses ambiguous or oversized collections', () => {
  const id = randomUUID(), other = randomUUID();
  const links = [{ id, nombre: 'First', token: 'never-display' }, { id: other, nombre: 'Second' }];
  assert.deepEqual(auditChanges('sucursales', { cajeros: links }, { cajeros: [...links].reverse() }).changes, []);
  const removed = auditChanges('sucursales', { cajeros: links }, { cajeros: [links[1]] });
  assert.ok(removed.changes.some(row => row.field.includes(id) && row.after === 'Sin asignacion'));
  assert.equal(JSON.stringify(removed).includes('never-display'), false);
  for (const malformed of [[links[0], links[0]], [{ id: 'forged', nombre: 'Name' }], Array(1001).fill(links[0]), {}]) {
    const value = auditChanges('sucursales', { cajeros: links }, { cajeros: malformed });
    assert.equal(value.changes.length, 1);
    assert.equal(value.changes[0].after, 'No registrado o no comparable');
  }
  const hidden = auditChanges('cuentas_bancarias', {}, { numero_cuenta_interno: 'private-number', numero_cuenta: 'private-number' });
  assert.deepEqual(hidden.changes, []);
});

test('preview: financial catalog audit is atomic, snapshots reflect stored values and revoked administrators cannot write',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async t => {
    const { Client } = require('pg');
    const client = new Client({ host: '127.0.0.1', port: 55433, database: 'temo_preview', user: 'temo_preview',
      ssl: false, options: '-c search_path=temo,public,extensions' });
    await client.connect();
    try {
      await client.query('begin');
      if (process.env.TEMO_TEST_RESTRICTED_ROLE === '1') {
        await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(client);
      }
      let point = 0;
      const db = { transaction: async work => {
        const name = `financial_catalog_${++point}`;
        await client.query(`savepoint ${name}`);
        try { const value = await work(client); await client.query(`release savepoint ${name}`); return value; }
        catch (error) { await client.query(`rollback to savepoint ${name}`); await client.query(`release savepoint ${name}`); throw error; }
      } };
      const marker = `AUD${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      const admin = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
        select id_rol,'Audit','Fixture',$1,crypt('FixturePassword123!',gen_salt('bf',4)),false from temo.roles where codigo='JEFA'
        returning id_usuario as id,version_sesion as "sessionVersion"`, [marker])).rows[0];
      admin.roleCode = 'JEFA';
      const service = new CatalogsService(db);
      const context = { ip: '::ffff:127.0.0.1', userAgent: 'Test Browser' };
      const bankInput = { code: marker, name: 'Fixture bank', shortName: 'Demo', kind: 'BANCO_REAL', status: 'ACTIVO',
        ignoredSecret: 'never-store-this' };
      let bank, commission, commissionInput, branch, otherBranch, account, accountInput, movement, movementInput;
      const events = async id => (await client.query(`select accion,tabla,datos_anteriores as before,datos_nuevos as after,
        host(direccion_ip) as ip,agente_usuario as agent from temo.bitacora where id_registro=$1 order by numero_auditoria`, [id])).rows;

      await t.test('bank create/edit/deactivation record exact before and after with actor context', async () => {
        bank = await service.save('banks', undefined, bankInput, admin, context);
        await service.save('banks', bank.id, { ...bankInput, name: 'Renamed bank' }, admin, context);
        await service.save('banks', bank.id, { ...bankInput, name: 'Renamed bank', status: 'INACTIVO' }, admin, context);
        const rows = await events(bank.id);
        assert.equal(rows.length, 3);
        assert.deepEqual(rows.map(row => row.accion), ['CREAR', 'ACTUALIZAR', 'ACTUALIZAR']);
        assert.equal(rows[0].before, null);
        assert.equal(rows[1].before.nombre_largo, 'Fixture bank');
        assert.equal(rows[1].after.nombre_largo, 'Renamed bank');
        assert.equal(rows[2].before.estado, 'ACTIVO');
        assert.equal(rows[2].after.estado, 'INACTIVO');
        assert.equal(rows[0].ip, '127.0.0.1');
        assert.equal(rows[0].agent, 'Test Browser');
        assert.ok(rows.every(row => row.tabla === 'entidades_bancarias'));
        assert.equal(JSON.stringify(rows).includes('never-store-this'), false);
      });

      await t.test('commission audit captures stored precision, linked entities and calculation changes', async () => {
        const movement = (await client.query('select id_movimiento as id from temo.movimientos limit 1')).rows[0];
        commissionInput = { entity: bank.id, currency: 'NIO', movement: movement.id, commissionCurrency: 'NIO',
          calculation: 'FIJO', fixed: '1.25', status: 'ACTIVO', injected: 'never-store-this' };
        commission = await service.save('commissions', undefined, commissionInput, admin, context);
        await service.save('commissions', commission.id, { ...commissionInput, fixed: '2.5' }, admin, { ip: 'invalid', userAgent: 'x'.repeat(500) });
        const rows = await events(commission.id);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].tabla, 'reglas_comisiones');
        assert.equal(rows[0].before, null);
        assert.equal(rows[1].before.monto_fijo, '1.2500');
        assert.equal(rows[1].after.monto_fijo, '2.5000');
        assert.equal(rows[1].after.id_entidad, bank.id);
        assert.equal(rows[1].after.banco, marker.toUpperCase());
        assert.equal(rows[1].after.moneda_comision, 'NIO');
        assert.equal(rows[1].ip, null);
        assert.equal(rows[1].agent.length, 300);
        assert.equal(JSON.stringify(rows).includes('never-store-this'), false);
        assert.ok(auditChanges('reglas_comisiones', rows[1].before, rows[1].after).changes.some(row => row.field === 'Monto fijo'));
      });

      await t.test('branch assignments are audited by UUID, including additions and removals', async () => {
        branch = await service.save('branches', undefined, { name: marker + ' branch', cashierIds: [admin.id] }, admin);
        otherBranch = await service.save('branches', undefined, { name: marker + ' other' }, admin);
        await service.save('branches', branch.id, { name: marker + ' branch edited', cashierIds: [] }, admin);
        const rows = await events(branch.id);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows[0].after.cajeros.map(row => row.id), [admin.id]);
        assert.deepEqual(rows[1].after.cajeros, []);
        assert.deepEqual(rows[1].before.cajeros.map(row => row.id), [admin.id]);
        assert.ok(auditChanges('sucursales', rows[1].before, rows[1].after).changes.some(row =>
          row.field.includes(admin.id) && row.before === 'Asignado' && row.after === 'Sin asignacion'));
      });

      await t.test('account scope changes and same-suffix number edits are visible without storing full numbers', async () => {
        const input = { entity: marker, currency: 'NIO', accountNumber: '1234567890123456', branchIds: [branch.id] };
        accountInput = input;
        account = await service.save('accounts', undefined, input, admin);
        await service.save('accounts', account.id, { ...input, accountNumber: '9999567890123456', branchIds: [otherBranch.id] }, admin);
        const rows = await events(account.id);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows[1].before.sucursales.map(row => row.id), [branch.id]);
        assert.deepEqual(rows[1].after.sucursales.map(row => row.id), [otherBranch.id]);
        assert.equal(rows[1].after.numero_cuenta_enmascarado, '****3456');
        assert.equal(rows[1].after.numero_cuenta_modificado, true);
        for (const raw of [input.accountNumber, '9999567890123456', 'numero_cuenta_interno']) {
          assert.equal(JSON.stringify(rows).includes(raw), false);
        }
        assert.ok(auditChanges('cuentas_bancarias', rows[1].before, rows[1].after).changes.some(row => row.field === 'Numero de cuenta cambiado'));
      });

      await t.test('movement audit includes only its mappings and compares cash/account direction changes', async () => {
        movementInput = { code: marker, name: marker + ' movement', banks: [marker], currencies: ['NIO'], direction: 'Ingreso' };
        movement = await service.save('movements', undefined, movementInput, admin);
        const mapping = (await client.query('select id_cuenta_movimiento as id from temo.cuentas_movimientos where id_movimiento=$1', [movement.id])).rows[0];
        await service.save('movements', movement.id, { ...movementInput, direction: 'Salida', mappingIds: [mapping.id] }, admin);
        const rows = await events(movement.id);
        assert.equal(rows[0].after.vinculos.length, 1);
        assert.equal(rows[1].before.vinculos[0].id, mapping.id);
        assert.equal(rows[1].before.vinculos[0].direccion_efectivo, 'ENTRA');
        assert.equal(rows[1].after.vinculos[0].direccion_efectivo, 'SALE');
        assert.equal(rows[1].after.vinculos[0].direccion_cuenta, 'ENTRA');
        assert.ok(auditChanges('movimientos', rows[1].before, rows[1].after).changes.some(row => row.field.includes('Direccion de efectivo')));
      });

      await t.test('foreign mapping IDs cannot deactivate another movement and parent edit rolls back', async () => {
        const otherMovement = await service.save('movements', undefined, { ...movementInput, code: marker + 'U', name: marker + ' unrelated' }, admin);
        const foreign = (await client.query('select id_cuenta_movimiento as id from temo.cuentas_movimientos where id_movimiento=$1', [otherMovement.id])).rows[0];
        await assert.rejects(service.save('movements', movement.id, { ...movementInput, name: 'Should roll back', mappingIds: [foreign.id] }, admin),
          e => e.getStatus() === 400);
        const state = (await client.query(`select mv.nombre,cm.estado from temo.cuentas_movimientos cm
          join temo.movimientos mv using(id_movimiento) where cm.id_cuenta_movimiento=$1`, [foreign.id])).rows[0];
        assert.equal(state.estado, 'ACTIVO');
        assert.equal((await events(movement.id)).length, 2);
        const stored = (await client.query('select nombre from temo.movimientos where id_movimiento=$1', [movement.id])).rows[0];
        assert.equal(stored.nombre, movementInput.name);
        const audit = await events(otherMovement.id);
        assert.equal(audit[0].after.vinculos.length, 1, 'other movement links do not leak into this snapshot');
      });

      await t.test('new catalogs also roll back links and inherited effects on audit failure', async () => {
        const broken = new CatalogsService({ transaction: work => db.transaction(real => work({ query: (sql, args) => {
          if (/insert into temo\.bitacora/i.test(sql)) throw new Error('SIMULATED_AUDIT_FAILURE');
          return real.query(sql, args);
        } })) });
        await assert.rejects(broken.save('branches', branch.id, { name: 'Should roll back', cashierIds: [admin.id], accountIds: [account.id] }, admin), /SIMULATED_AUDIT_FAILURE/);
        const branchState = (await client.query('select nombre from temo.sucursales where id_sucursal=$1', [branch.id])).rows[0];
        assert.equal(branchState.nombre, marker + ' branch edited');
        assert.equal((await client.query('select 1 from temo.usuarios_sucursales where id_sucursal=$1', [branch.id])).rowCount, 0);
        const beforeAccounts = (await client.query('select count(*)::int as total from temo.cuentas_bancarias where id_entidad=$1', [bank.id])).rows[0].total;
        const beforeMappings = (await client.query('select count(*)::int as total from temo.cuentas_movimientos')).rows[0].total;
        await assert.rejects(broken.save('accounts', undefined, { entity: marker, currency: 'NIO', branchIds: [branch.id] }, admin), /SIMULATED_AUDIT_FAILURE/);
        assert.equal((await client.query('select count(*)::int as total from temo.cuentas_bancarias where id_entidad=$1', [bank.id])).rows[0].total, beforeAccounts);
        assert.equal((await client.query('select count(*)::int as total from temo.cuentas_movimientos')).rows[0].total, beforeMappings);
        await assert.rejects(broken.save('movements', movement.id, { ...movementInput, direction: 'Ingreso' }, admin), /SIMULATED_AUDIT_FAILURE/);
        const effect = (await client.query(`select direccion_efectivo from temo.efectos_movimientos
          join temo.cuentas_movimientos using(id_cuenta_movimiento) where id_movimiento=$1`, [movement.id])).rows[0];
        assert.equal(effect.direccion_efectivo, 'SALE');
      });

      await t.test('stale administrator version denies modifications without creating an audit or changing catalog', async () => {
        for (const [resource, id, input] of [['banks', bank.id, bankInput], ['commissions', commission.id, commissionInput],
          ['branches', branch.id, { name: 'Not saved' }], ['accounts', account.id, accountInput], ['movements', movement.id, movementInput]]) {
          await assert.rejects(service.save(resource, id, input, { ...admin, sessionVersion: admin.sessionVersion + 1 }), e => e.getStatus() === 403);
        }
        assert.equal((await events(bank.id)).length, 3);
        assert.equal((await events(commission.id)).length, 2);
      });

      await t.test('a disabled or demoted administrator is rechecked inside the catalog transaction', async () => {
        for (const change of ["estado='INACTIVO'", "id_rol=(select id_rol from temo.roles where codigo='CAJERO')"]) {
          await client.query('savepoint actor_change');
          try {
            await client.query(`update temo.usuarios set ${change} where id_usuario=$1`, [admin.id]);
            await assert.rejects(service.save('banks', bank.id, bankInput, admin), e => e.getStatus() === 403);
            await assert.rejects(service.save('commissions', commission.id, commissionInput, admin), e => e.getStatus() === 403);
            for (const [resource, id, input] of [['branches', branch.id, { name: 'Not saved' }],
              ['accounts', account.id, accountInput], ['movements', movement.id, movementInput]]) {
              await assert.rejects(service.save(resource, id, input, admin), e => e.getStatus() === 403);
            }
          } finally {
            await client.query('rollback to savepoint actor_change');
            await client.query('release savepoint actor_change');
          }
        }
        assert.equal((await events(bank.id)).length, 3);
        assert.equal((await events(commission.id)).length, 2);
      });

      await t.test('audit failure rolls back both insertion and update, preserving original configuration', async () => {
        const broken = new CatalogsService({ transaction: work => db.transaction(real => work({ query: (sql, args) => {
          if (/insert into temo\.bitacora/i.test(sql)) throw new Error('SIMULATED_AUDIT_FAILURE');
          return real.query(sql, args);
        } })) });
        const failedCode = marker + 'F';
        await assert.rejects(broken.save('banks', undefined, { ...bankInput, code: failedCode }, admin), /SIMULATED_AUDIT_FAILURE/);
        assert.equal((await client.query('select 1 from temo.entidades_bancarias where codigo=$1', [failedCode])).rowCount, 0);
        await assert.rejects(broken.save('commissions', commission.id, { ...commissionInput, fixed: '99' }, admin), /SIMULATED_AUDIT_FAILURE/);
        const stored = (await client.query('select monto_fijo from temo.reglas_comisiones where id_comision=$1', [commission.id])).rows[0];
        assert.equal(stored.monto_fijo, '2.5000');
        assert.equal((await events(commission.id)).length, 2);
      });

      await t.test('missing catalog records reject updates and do not generate fictitious success events', async () => {
        const missing = randomUUID();
        for (const resource of ['banks', 'commissions', 'branches', 'accounts', 'movements']) {
          await assert.rejects(service.save(resource, missing, {}, admin), e => e.getStatus() === 404);
        }
        assert.equal((await events(missing)).length, 0);
      });
    } finally { await client.query('rollback'); await client.end(); }
  });
