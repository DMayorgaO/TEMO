const test = require('node:test');
const assert = require('node:assert/strict');

test('handover audit exposes event and actor references, not nested snapshot or credentials',()=>{
  const {auditChanges}=require('../dist/modules/catalogs/audit-changes');
  const result=auditChanges('traspasos_turno',null,{evento:'ACEPTAR_TRASPASO',detalle:{source:'source-id',destination:'destination-id',sender:'sender-id',receiver:'receiver-id',snapshot:{private:'never-show'},token:'never-show'}});
  assert.equal(result.changes.length,5);
  assert.ok(!JSON.stringify(result).includes('never-show'));
  assert.ok(result.changes.some(row=>row.field==='Cajero receptor'&&row.after==='receiver-id'));
});
const { auditChanges } = require('../dist/modules/catalogs/audit-changes');
const { CatalogsController } = require('../dist/modules/catalogs/catalogs.controller');

test('payment audit shows approved settlement totals and method without expanding pending lists or secrets',()=>{
  const result=auditChanges('pagos_pendientes',{saldo_pendiente:20,pendientes:[{token:'do-not-display'}]},
    {estado:'PAGADO',saldo_pendiente:0,method:'MIXTO',totalAmount:20,cantidad_pendientes:2,pendingIds:['private-id'],secret:'do-not-display'});
  assert.ok(result.changes.some(row=>row.field==='Saldo pendiente'&&row.before==='20'&&row.after==='0'));
  assert.ok(result.changes.some(row=>row.field==='Forma de pago'&&row.after==='MIXTO'));
  assert.ok(result.changes.some(row=>row.field==='Cantidad de pendientes'&&row.after==='2'));
  assert.ok(!JSON.stringify(result).includes('private-id'));
  assert.ok(!JSON.stringify(result).includes('do-not-display'));
});

test('handover audit compares mode, amounts and source state without expanding raw snapshots',()=>{
  const result=auditChanges('traspasos_turno',{detalle:{state:'PENDIENTE',sourceState:'ABIERTO',registeredNio:0}},
    {evento:'ACEPTAR_TRASPASO',detalle:{state:'ACEPTADO',sourceState:'EN_REVISION',mode:'EN_REVISION',cashNio:1000,cashUsd:20,registeredNio:5,differenceNio:0,purchaseDifferenceNio:3,
      snapshot:{token:'private-secret',accounts:['not-for-display']},password:'private-secret'}});
  assert.ok(result.changes.some(row=>row.field==='Estado del turno saliente'&&row.before==='ABIERTO'&&row.after==='EN_REVISION'));
  assert.ok(result.changes.some(row=>row.field==='Diferencia registrada NIO'&&row.before==='0'&&row.after==='5'));
  assert.ok(!JSON.stringify(result).includes('private-secret'));
  assert.ok(!JSON.stringify(result).includes('not-for-display'));
});

test('review shift audit shows changed cent coins and approved balance fields only',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const before={changeNio:0,settlement:{primaryCounts:{NIO:[{denomination:.25,piles25:0,loose:1}],USD:[]}},balances:[{id,account:'BAC NIO',currency:'NIO',system:10,password:'secret'}]};
  const after={...before,changeNio:2,settlement:{primaryCounts:{NIO:[{denomination:.25,piles25:0,loose:2}],USD:[]}},balances:[{id,account:'BAC NIO',currency:'NIO',system:20,password:'hidden'}]};
  const result=auditChanges('turnos',before,after);
  assert.ok(result.changes.some(row=>row.field==='Arqueo C$ 0.25'&&row.before==='1 unidades'&&row.after==='2 unidades'));
  assert.ok(result.changes.some(row=>row.field.includes('Saldo Sistema')&&row.before==='10'&&row.after==='20'));
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.deepEqual(auditChanges('turnos',{}, {balances:[{id:'bad',password:'secret'}]}).changes,[]);
});

test('audit changes only exposes approved scalars and distinguishes missing from null', () => {
  const result = auditChanges('pagos_pendientes', { estado: 'PENDIENTE', password: 'secret' }, { estado: 'PAGADO', saldo_pendiente: null, token: 'secret', monto_original: { token: 'secret' } });
  assert.deepEqual(result.changes, [
    { field: 'Estado', before: 'PENDIENTE', after: 'PAGADO' },
    { field: 'Saldo pendiente', before: 'No registrado', after: 'Sin valor' },
  ]);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.deepEqual(auditChanges('unknown', { password: 'secret' }, { password: 'secret2' }).changes, []);
  assert.equal(auditChanges('transacciones', null, { amount: 100 }).hasBefore, false);
  assert.deepEqual(auditChanges('transacciones', { amount: 100 }, { amount: 100 }).changes, []);
});

test('audit detail denies non-admin before querying and binds the identifier', async () => {
  const calls = [];
  const controller = new CatalogsController({ query: async (...args) => { calls.push(args); return { rows: [{ tabla: 'usuarios', datos_nuevos: { evento: 'MFA_VERIFICADO', secret: 'hidden' }, datos_anteriores: null }] }; } }, {});
  for (const roleCode of ['CAJERO', 'TRANSFERISTA', 'OTHER']) {
    await assert.rejects(controller.auditDetail('id', { user: { roleCode } }), error => error.getStatus() === 403);
  }
  assert.equal(calls.length, 0);
  const result = await controller.auditDetail('id', { user: { roleCode: 'JEFA' } });
  assert.deepEqual(calls[0][1], ['id']);
  assert.ok(!JSON.stringify(result).includes('hidden'));
  const absent = new CatalogsController({ query: async () => ({ rows: [] }) }, {});
  await assert.rejects(absent.auditDetail('id', { user: { roleCode: 'JEFA' } }), error => error.getStatus() === 404);
});

test('rates compares only explicitly allowed nested paths', () => {
  const result = auditChanges('transacciones', { rates: { buy: 36.4, sell: 37, secret: 'hidden' } }, { rates: { buy: 36.55, sell: 37, secret: 'exposed' } });
  assert.deepEqual(result.changes, [{ field: 'Tasa de compra', before: '36.4', after: '36.55' }]);
  assert.ok(!JSON.stringify(result).includes('hidden'));
});

test('cash comparison groups denominations, converts x25, and treats absent data as unknown', () => {
  const snapshot = rows => ({ settlement: { primaryCounts: { NIO: rows, USD: [] }, changeCounts: { NIO: [], USD: [] } } });
  const old = snapshot([{ denomination: 100, piles25: 1, loose: 0, token: 'secret' }]);
  const equivalent = snapshot([{ denomination: 100, piles25: 0, loose: 20 }, { denomination: 100, piles25: 0, loose: 5 }]);
  assert.deepEqual(auditChanges('transacciones', old, equivalent).changes, []);
  const next = snapshot([{ denomination: 100, piles25: 0, loose: 24 }]);
  assert.deepEqual(auditChanges('transacciones', old, next).changes, [{ field: 'Efectivo principal C$ 100', before: '25 unidades', after: '24 unidades' }]);
  assert.equal(auditChanges('transacciones', null, next).changes[0].before, 'No registrado');
  assert.equal(auditChanges('transacciones', old, snapshot([])).changes[0].after, '0 unidades');
  assert.equal(auditChanges('transacciones', old, snapshot([{ denomination: 100, piles25: -1, loose: 0 }])).changes[0].after, 'No registrado');
  assert.ok(!JSON.stringify(auditChanges('transacciones', old, next)).includes('secret'));
});

test('group comparison pairs UUIDs, not array positions, and filters nested secrets', () => {
  const a = { id: '00000000-0000-4000-8000-000000000001', order: 1, amount: 100, estado: 'REGISTRADA' };
  const b = { id: '00000000-0000-4000-8000-000000000002', order: 2, amount: 60, estado: 'REGISTRADA' };
  assert.deepEqual(auditChanges('grupos_transacciones', { auditTransactions: [a, b] }, { auditTransactions: [b, a] }).changes, []);
  const result = auditChanges('grupos_transacciones', { auditTransactions: [a, b] }, { auditTransactions: [{ ...b, estado: 'ANULADA', password: 'hidden' }, { ...a, amount: 120 }] });
  assert.equal(result.changes.length, 2);
  assert.ok(result.changes.some(row => row.field.includes('Pestana 1') && row.before === '100' && row.after === '120'));
  assert.ok(result.changes.some(row => row.field.includes('Pestana 2') && row.after === 'ANULADA'));
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.deepEqual(auditChanges('grupos_transacciones', {}, { auditTransactions: [{ id: 'bad', amount: 1 }] }).changes, []);
});

test('historical corrections expose approved differences, never stored raw payloads', () => {
  const result = auditChanges('correcciones_transacciones_cerradas',
    { auditTransaction: { amount: 100, estado: 'REGISTRADA', token: 'hidden' } },
    { auditTransaction: { amount: 120, estado: 'ANULADA', token: 'secret' }, cierrePreservado: true });
  assert.ok(result.changes.some(row => row.field === 'Monto' && row.before === '100' && row.after === '120'));
  assert.ok(result.changes.some(row => row.field === 'Estado' && row.after === 'ANULADA'));
  assert.ok(!JSON.stringify(result).includes('hidden'));
  assert.ok(!JSON.stringify(result).includes('secret'));
});
