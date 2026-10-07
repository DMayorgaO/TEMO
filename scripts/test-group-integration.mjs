import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import pg from 'pg';
const require = createRequire(import.meta.url);
const { TransactionsService } = require('../backend/dist/modules/transactions/transactions.service');
const { ShiftsService } = require('../backend/dist/modules/shifts/shifts.service');
const client = new pg.Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview' });
await client.connect();
await client.query('begin');
let sequence = 0;
const db = { query: (...args) => client.query(...args), transaction: async work => {
  const name = `test_${++sequence}`;
  await client.query(`savepoint ${name}`);
  try { const value = await work(client); await client.query(`release savepoint ${name}`); return value; }
  catch (error) { await client.query(`rollback to savepoint ${name}`); throw error; }
} };
const service = new TransactionsService(db);
const shifts = new ShiftsService(db);
const rates = { buy: 36.4, sell: 37 };
const empty = () => ({ NIO: [], USD: [] });
const settlement = (direction = 'COMPRA', cash = 0) => ({ primaryRateKind: direction, changeRateKind: 'VENTA', expectedChange: { NIO: 0, USD: 0 }, primaryCounts: cash ? { NIO: [{ denomination: 100, piles25: 0, loose: cash / 100 }], USD: [] } : empty(), changeCounts: empty() });
const tx = (code, amount, extra = {}) => ({ entityCode: 'BAC', movementCode: code, currencyCode: 'NIO', amount, pendingName: '', description: 'INTEGRATION', settlement: settlement(code === 'RE' ? 'VENTA' : 'COMPRA'), ...extra });
try {
  const admin = { id: (await client.query("select id_usuario from temo.usuarios where usuario='admin.pruebas'")).rows[0].id_usuario, roleCode: 'JEFA' };
  const cashierId = (await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
    select id_rol,'TEST','ROLLBACK','integration.rollback','unused',false from temo.roles where codigo='CAJERO' returning id_usuario`)).rows[0].id_usuario;
  const cashier = { id: cashierId, roleCode: 'CAJERO' };
  const branch = (await client.query('select * from temo.sucursales order by fecha_creacion limit 1')).rows[0];
  await client.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)', [cashier.id, branch.id_sucursal]);
  await shifts.create({ branch: branch.nombre, branchId: branch.id_sucursal, register: 'INTEGRATION', cashier: 'integration.rollback', notes: '', counts: { NIO: [{ denomination: 100, piles25: 4, loose: 0 }], USD: [] }, balances: [] }, admin);
  const shift = (await client.query('select id_turno from temo.turnos where id_cajero=$1', [cashier.id])).rows[0].id_turno;
  async function create(rows, pendingIds = []) {
    const result = await service.createBatch({ userId: cashier.id, shiftId: shift, rates, transactions: rows, pendingSettlementIds: pendingIds, settlement: settlement() }, {});
    const group = result.groupId;
    const ids = (await client.query('select id_transaccion from temo.transacciones where id_grupo_transacciones=$1 order by orden_grupo', [group])).rows.map(row => row.id_transaccion);
    return { result, ids };
  }
  const pending = await create([tx('DC', 180, { pendingName: 'TEST PENDING' })]);
  const pendingId = (await client.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1', [pending.ids[0]])).rows[0].id_pendiente;
  const group = await create([tx('RE', 380), tx('DC', 200)], [pendingId]);
  await service.updateGroup(group.ids[0], { preferential: false, updates: group.ids.map((id,index) => ({ id, data: { ...tx(index ? 'DC' : 'RE', index ? 200 : 380), rates } })), voidIds: [] }, cashier);
  assert.equal((await client.query('select estado from temo.pagos_pendientes where id_pendiente=$1', [pendingId])).rows[0].estado, 'PAGADO');
  await assert.rejects(service.updateGroup(group.ids[0], { preferential: false, updates: group.ids.map((id,index) => ({ id, data: { ...tx(index ? 'DC' : 'RE', index ? 300 : 380), rates } })), voidIds: [] }, cashier), /no cubre/);
  await service.updateGroup(group.ids[0], { preferential: false, updates: [{ id: group.ids[0], data: { ...tx('RE', 380, { settlement: settlement('VENTA', 200) }), rates } }], voidIds: [group.ids[1]] }, cashier);
  assert.equal((await client.query('select id_transaccion from temo.abonos_pendientes where id_pendiente=$1', [pendingId])).rows[0].id_transaccion, group.ids[0]);
  await service.updateGroup(group.ids[0], { preferential: false, updates: [], voidIds: [group.ids[0]] }, cashier);
  assert.equal(Number((await client.query('select saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1', [pendingId])).rows[0].saldo_pendiente), 180);
  console.log('PASS compensation edit, insufficient funds rollback, reanchor, annul and reopen');

  await service.payPendingBatch({ pendingIds: [pendingId], method: 'DIGITAL', rates, digital: { entityCode: 'BAC', movementCode: 'RE' } }, cashier);
  const digitalId = (await client.query('select id_transaccion from temo.abonos_pendientes where id_pendiente=$1', [pendingId])).rows[0].id_transaccion;
  await service.updateGroup(digitalId, { preferential: false, updates: [{ id: digitalId, data: { ...tx('RE', 170), rates } }], voidIds: [] }, cashier);
  assert.equal(Number((await client.query('select saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1', [pendingId])).rows[0].saldo_pendiente), 10);
  await service.updateGroup(digitalId, { preferential: false, updates: [], voidIds: [digitalId] }, cashier);
  assert.equal(Number((await client.query('select saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1', [pendingId])).rows[0].saldo_pendiente), 180);
  console.log('PASS digital partial correction and annul reopen pending');

  const another = await create([tx('DC', 220, { pendingName: 'SECOND PENDING' })]);
  const anotherId = (await client.query('select id_pendiente from temo.pagos_pendientes where id_transaccion=$1', [another.ids[0]])).rows[0].id_pendiente;
  await service.payPendingBatch({ pendingIds: [pendingId, anotherId], method: 'EFECTIVO', rates, settlement: settlement('COMPRA',400) }, cashier);
  const paidDetail = await service.pendingPaymentDetail(pendingId, cashier);
  assert.equal(paidDetail.compensations.length,2);
  assert.equal(paidDetail.details.length,2);
  assert.equal(paidDetail.cash.length,1);
  assert.equal(Number(paidDetail.cash[0].loose),4);
  await service.updateGroup(pending.ids[0], { preferential:false,updates:[{id:pending.ids[0],data:{...tx('DC',200,{pendingName:'TEST PENDING'}),rates}}],voidIds:[] },cashier);
  assert.equal(Number((await client.query('select saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1',[pendingId])).rows[0].saldo_pendiente),20);
  await assert.rejects(service.updateGroup(pending.ids[0], {preferential:false,updates:[{id:pending.ids[0],data:{...tx('DC',100,{pendingName:'TEST PENDING'}),rates}}],voidIds:[]},cashier),/no inferior/);
  console.log('PASS multiple cash payment detail and edits preserve existing abonos');
  await assert.rejects(service.reopenPaymentBatch(pendingId,[paidDetail.compensations[0].id_abono],cashier),/liquidacion cambio/);
  const reopened = await service.reopenPaymentBatch(pendingId,paidDetail.compensations.map(row=>row.id_abono),cashier);
  assert.equal(reopened.ids.length,2);
  assert.equal(Number((await client.query('select saldo_pendiente from temo.pagos_pendientes where id_pendiente=$1',[pendingId])).rows[0].saldo_pendiente),200);
  const mixedCash=settlement('COMPRA',200);
  mixedCash.primaryCounts.NIO.push({denomination:20,piles25:0,loose:1});
  await service.payPendingBatch({pendingIds:[pendingId,anotherId],method:'MIXTO',rates,settlement:mixedCash,digital:{entityCode:'BAC',movementCode:'RE',amount:200}},cashier);
  const mixed=await service.pendingPaymentDetail(pendingId,cashier);
  assert.equal(new Set(mixed.compensations.map(row=>row.pending_database_id)).size,2);
  assert.equal(mixed.compensations.reduce((sum,row)=>sum+Number(row.monto),0),420);
  assert.equal(mixed.cash.length,2);
  await service.reopenPaymentBatch(pendingId,mixed.compensations.map(row=>row.id_abono),cashier);
  assert.equal((await service.pendingPaymentDetail(pendingId,cashier)).compensations.length,0);
  console.log('PASS full cash/mixed batch reversal and stale confirmation rejection');

  const legacyResult = await service.createBatch({userId:cashier.id,shiftId:shift,rates,
    transactions:[tx('DC',60),tx('DC',40)].map(({settlement:unused,...row})=>row),pendingSettlementIds:[],settlement:settlement('COMPRA',100)},{});
  const legacyIds=(await client.query('select id_transaccion from temo.transacciones where id_grupo_transacciones=$1 order by orden_grupo',[legacyResult.groupId])).rows.map(row=>row.id_transaccion);
  await service.updateGroup(legacyIds[0],{preferential:false,updates:legacyIds.map((id,index)=>({id,data:{...tx('DC',index?40:60,{settlement:settlement('COMPRA',index?100:0)}),rates}})),voidIds:[]},cashier);
  assert.equal((await service.groupDetail(legacyIds[0],cashier)).details.some(detail=>detail.settlement.shared),false);
  console.log('PASS legacy shared cash converts once into tab cash');

  const normal=await create([tx('RE',100,{currencyCode:'USD'}),tx('DC',3640)]);
  for(const buy of [36.55,36.4]) {
    await service.updateGroup(normal.ids[0],{preferential:buy===36.55,updates:normal.ids.map((id,index)=>({id,data:{...tx(index?'DC':'RE',index?buy*100:100,{currencyCode:index?'NIO':'USD'}),rates:{buy,sell:37}}})),voidIds:[]},cashier);
    assert.equal((await service.detail(normal.ids[0],cashier)).rates.buy,buy);
  }
  console.log('PASS D rate enable and disable within an edited group');

  const historical = await create([tx('DC', 100, { settlement: settlement('COMPRA', 100) })]);
  await client.query("update temo.turnos set estado='CERRADO',fecha_cierre=now() where id_turno=$1", [shift]);
  const snapshot = async () => (await client.query(`select jsonb_build_object('transactions',(select jsonb_agg(t) from temo.transacciones t where id_turno=$1),
    'cash',(select jsonb_agg(a) from temo.arqueos a where id_turno=$1),'shift',(select to_jsonb(s) from temo.turnos s where id_turno=$1),
    'accounts',(select jsonb_agg(m) from temo.movimientos_cuentas m join temo.transacciones t using(id_transaccion) where t.id_turno=$1)) as data`, [shift])).rows[0].data;
  const before = await snapshot();
  await assert.rejects(service.updateGroup(historical.ids[0], { preferential: false, updates: [], voidIds: historical.ids }, cashier), /turno abierto/);
  await service.updateGroup(historical.ids[0], { preferential: false, updates: [{ id: historical.ids[0], data: { ...tx('DC', 200, { settlement: settlement('COMPRA', 200) }), rates } }], voidIds: [] }, admin);
  assert.equal((await service.detail(historical.ids[0], admin)).transaction.monto, '200');
  assert.deepEqual(await snapshot(), before);
  await service.updateGroup(historical.ids[0], { preferential: false, updates: [], voidIds: historical.ids }, admin);
  assert.equal((await service.detail(historical.ids[0], admin)).transaction.estado, 'ANULADA');
  assert.deepEqual(await snapshot(), before);
  console.log('PASS historical corrections and annul preserve ledger, cash and closed shift');
} finally { await client.query('rollback'); await client.end(); }
