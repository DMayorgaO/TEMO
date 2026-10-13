const test=require('node:test');
const assert=require('node:assert/strict');
const {calculatePurchaseLedger}=require('../dist/modules/dollar-purchases/purchase-ledger');
const step=(id,overrides={})=>({database_id:String(id),id:String(id),group_id:'group',fecha_transaccion:'2026-10-13T12:00:00Z',
  currency:'USD',direction:'ENTRA',amount:100,tasa_compra_usada:36.4,tasa_venta_usada:37,
  primary_nio:0,primary_usd:0,change_nio:0,change_usd:0,shared:false,sale_eligible:true,
  primary_direction:'ENTRA',cajero:'Cashier',sucursal:'Branch',compensation_nio:0,compensation_usd:0,...overrides});
const cases=[
  ['retained withdrawal and extra NIO',[step(1,{currency:'NIO',direction:'SALE',amount:8600}),step(2,{amount:235.13,primary_nio:100})],235.13],
  ['paid withdrawal is not reused',[step(1,{currency:'NIO',direction:'SALE',amount:8600,primary_nio:8600}),step(2,{amount:235.13,primary_nio:100})],100/37],
  ['physical USD reduces conversion',[step(1,{currency:'NIO',direction:'SALE',amount:8600}),step(2,{amount:235.13,primary_nio:100,primary_usd:1})],234.13],
  ['same currency retained USD is not a purchase',[step(1,{direction:'SALE'}),step(2)],0],
  ['remittance paid at buy rate does not erase later income',[step(1,{direction:'SALE',primary_nio:3640}),step(2,{primary_nio:3700})],100],
  ['physical USD covers income despite NIO overpayment',[step(1,{primary_usd:100,primary_nio:100})],0],
  ['all NIO returned',[step(1,{primary_nio:400,change_nio:400})],0],
  ['partial NIO returned',[step(1,{primary_nio:3700,change_nio:100})],3600/37],
  ['buy-rate income excluded',[step(1,{primary_nio:3640,sale_eligible:false})],0],
  ['late cash covers two income tabs',[step(1),step(2,{primary_nio:7400})],200],
  ['retained withdrawal after income still funds that income',[step(1),step(2,{currency:'NIO',direction:'SALE',amount:3700})],100],
  ['shared cash and change are read once',[step(1,{shared:true,primary_nio:7500,change_nio:100}),step(2,{shared:true,primary_nio:7500,change_nio:100})],200],
  ['shared NIO deposit is not USD financing',[step(1,{currency:'NIO',amount:100,shared:true,primary_nio:470}),step(2,{amount:10,shared:true,primary_nio:470})],10],
  ['different groups never share retained money',[step(1,{currency:'NIO',direction:'SALE',amount:3700}),step(2,{group_id:'other'})],0],
  ['rounding surplus is not another USD purchase',[step(1,{amount:182}),step(2,{amount:25.02,primary_nio:400,primary_usd:200,change_nio:140})],7.02],
];
for(const [name,rows,expected] of cases)test(`purchase ledger: ${name}`,()=>{
  const result=calculatePurchaseLedger(rows);
  const total=result.reduce((sum,row)=>sum+Number(row.monto_comprado_usd),0);
  assert.ok(Math.abs(total-expected)<0.0001,`${total} != ${expected}`);
  for(const row of result)assert.ok(Number(row.monto_comprado_usd)<=Number(rows.find(item=>item.database_id===row.database_id).amount)+0.0001);
});
