import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const require = createRequire(import.meta.url);
const { ShiftsService } = require('../backend/dist/modules/shifts/shifts.service');
const client = new pg.Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview' });
await client.connect();
try {
  await client.query(readFileSync(new URL('../database/init/038_teledolar_system_reference.sql', import.meta.url), 'utf8'));
  await client.query('begin');
  const service = new ShiftsService({ query: (...args) => client.query(...args), transaction: work => work(client) });
  const { rows: [shift] } = await client.query(`select stc.id_turno from temo.saldos_turno_cuentas stc
    join temo.cuentas_bancarias cb using(id_cuenta) join temo.entidades_bancarias e using(id_entidad)
    join temo.turnos t using(id_turno) where e.codigo='TELEDOLAR' and t.estado='ABIERTO' limit 1`);
  assert(shift, 'Se requiere un turno de prueba con Teledolar');
  // Isolate balance persistence from authorization and unrelated detail loading.
  service.findAuthorizedShift = async () => ({});
  service.detail = id => service.loadBalances(id);
  const before = (await service.loadBalances(shift.id_turno)).find(row => row.entity === 'TELEDOLAR');
  const income = Number(before.income) + 25;
  const expense = Number(before.expense) + 10;
  await service.saveBalances(shift.id_turno, [{ account: before.account, amount: income - expense, income, expense }], {});
  const saved = (await service.loadBalances(shift.id_turno)).find(row => row.account === before.account);
  assert.equal(Number(saved.system_income), income);
  assert.equal(Number(saved.system_expense), expense);
  assert.equal(Number(saved.difference), 15);
  // Moving the reference simulates subsequent incoming/outgoing totals without creating financial records.
  await client.query(`update temo.saldos_turno_cuentas set ingresos_referencia_sistema=ingresos_referencia_sistema-7,
    egresos_referencia_sistema=egresos_referencia_sistema-3 where id_turno=$1 and id_cuenta=$2`, [shift.id_turno, before.account_id]);
  const changed = (await service.loadBalances(shift.id_turno)).find(row => row.account === before.account);
  assert.equal(Number(changed.system_income), income + 7);
  assert.equal(Number(changed.system_expense), expense + 3);
  assert.equal(Number(changed.system), Number(changed.calculated) + 19);
  console.log('PASS Teledolar: manual values, separate movement deltas, net difference; fixtures rolled back');
} finally {
  await client.query('rollback');
  await client.end();
}
