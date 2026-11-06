// Synthetic API responses only: exercise the actual form and validate its payload with the backend.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const {TransactionsService}=require('../../backend/dist/modules/transactions/transactions.service');
const {createTransactionBatchSchema}=require('../../backend/dist/modules/transactions/transaction-batch.schema');
const service=new TransactionsService({});
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const ids=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const cases=[
 {name:'nio-withdrawal',currency:'NIO',amount:500,debt:{NIO:0,USD:10},kind:'VENTA',change:130},
 {name:'usd-withdrawal',currency:'USD',amount:15,debt:{NIO:364,USD:0},kind:'COMPRA',change:182},
 {name:'nio-change',currency:'NIO',amount:100,received:600,debt:{NIO:0,USD:10},kind:'VENTA',change:130},
 {name:'usd-change',currency:'USD',amount:5,received:20,debt:{NIO:364,USD:0},kind:'COMPRA',change:182},
 {name:'mixed-debts',currency:'NIO',amount:500,debt:{NIO:130,USD:10},kind:'VENTA',change:0},
 {name:'multiple-tabs',currency:'NIO',amount:1000,deposit:500,debt:{NIO:0,USD:10},kind:'VENTA',change:130},
 {name:'insufficient',currency:'NIO',amount:300,debt:{NIO:0,USD:10},kind:'VENTA',change:0,rejected:true},
];
const shift={database_id:sid,id:'TUR-000100',estado:'ABIERTO',id_sucursal:sid,sucursal:'QA',caja:'QA',cajero:'QA',cambio_nio:'0',
 cashCounts:{ACTUAL:{NIO:{total:1000,lines:[]},USD:{total:100,lines:[]}}},expectedCash:{NIO:1000,USD:100},expectedGeneralRate:36.4,balances:[],
 availableAccounts:['NIO','USD'].map(currency=>({account_id:currency,account:'BAC '+currency,entity:'BAC',currency})),
 availableMovements:[{entity:'BAC',code:'RE',name:'Retiro',direction:'Salida',accountDirection:'Ingreso',affectsAccount:true,currencies:['NIO','USD']},
 {entity:'BAC',code:'DC',name:'Deposito',direction:'Ingreso',accountDirection:'Salida',affectsAccount:true,currencies:['NIO','USD']}]};
(async()=>{const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
try{for(const scenario of cases){
 const context=await browser.newContext({viewport:scenario.name==='usd-change'?{width:1920,height:1080}:{width:1366,height:768},timezoneId:'America/Managua'});
 const user={id:uid,fullName:'QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_TRANSACTIONS','VER_CASH_COUNT']};
 await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-cross-currency-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
 const errors=[],attempts=[];
 const pendings=Object.entries(scenario.debt).filter(([,amount])=>amount>0).map(([currency,amount],index)=>({database_id:ids[index],id:`PEN-00000${index+1}`,tipo:'POR_COBRAR',estado:'PENDIENTE',saldo_pendiente:String(amount),moneda:currency,contraparte:'CLIENTE QA '+currency,fecha_creacion:new Date().toISOString(),sucursal:'QA',cajero:'QA'}));
 await context.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname.replace(/^.*\/api/,'');let body=[];
  if(p==='/auth/me')body={user};else if(p==='/shifts/access')body={active:shift,prepared:null};
  else if(p==='/shifts/current')body=shift;else if(p==='/shifts')body=[shift];
  else if(p==='/transactions/table')body={rows:[],total:0,totals:{}};
  else if(p==='/transactions/pending')body=pendings;
  else if(p==='/transactions/batch'){
   const input=createTransactionBatchSchema.parse(req.postDataJSON());attempts.push(input);
   assert.deepEqual(input.pendingSettlementIds,pendings.map(row=>row.database_id));
   assert.equal(input.transactions[0].amount,scenario.amount);assert.equal(input.transactions[0].currencyCode,scenario.currency);
   assert.equal(input.transactions.at(-1).settlement.changeRateKind,scenario.kind);
   assert.ok(Math.abs(input.transactions.at(-1).settlement.expectedChange.NIO-scenario.change)<.00001);
   const directions=scenario.deposit?['SALE','ENTRA']:[scenario.received?'ENTRA':'SALE'];
   if(scenario.rejected)assert.throws(()=>service.validateCompensatedGroup(input,directions,scenario.debt),/no cubre/);
   else assert.ok(service.validateCompensatedGroup(input,directions,scenario.debt).length>0);
   await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'QA: validado sin guardar.'})});return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3188/#/transacciones');await page.getByRole('button',{name:'Agregar',exact:true}).click();
 const modal=page.locator('.transaction-modal-panel');await modal.locator('.transaction-form-movement select').selectOption({label:scenario.received?'Deposito':'Retiro'});
 await modal.locator(`[data-transaction-currency="${scenario.currency}"]`).click();
 await modal.locator('[data-transaction-amount]').fill(String(scenario.amount));
 await modal.getByRole('button',{name:'Liquidar pendientes',exact:true}).click();
 for(const checkbox of await modal.locator('.transaction-pending-settlement__list input[type="checkbox"]').all())await checkbox.check();
 if(scenario.received){const row=scenario.currency==='NIO'?3:2;await modal.locator(`[data-cash-scope="received"][data-cash-currency="${scenario.currency}"][data-cash-row="${row}"][data-cash-column="1"]`).fill(String(scenario.received/(scenario.currency==='NIO'?100:20)));}
 if(scenario.deposit){await modal.locator('.transaction-tabs__add').click();await modal.locator('.transaction-form-movement select').selectOption({label:'Deposito'});await modal.locator('[data-transaction-amount]').fill(String(scenario.deposit));}
 await modal.getByText('Conversiones del grupo',{exact:true}).waitFor();
 const rateLabel=await modal.locator('.transaction-rate-chip strong').first().innerText();
 assert.ok(rateLabel.includes(scenario.kind==='COMPRA'?'Compra C$ 36.40':'Venta C$ 37.00'),rateLabel);
 await modal.getByRole('button',{name:scenario.deposit?'Guardar 2 transacciones':'Guardar',exact:true}).click();
 await modal.getByText('QA: validado sin guardar.',{exact:true}).waitFor();
 assert.equal(attempts.length,1);assert.deepEqual(errors,[]);
 await page.screenshot({path:`tmp/cross-currency-${scenario.name}.png`,fullPage:true});await context.close();
 }}finally{await browser.close();}console.log('Seven cross-currency UI scenarios validated; no financial writes.');})().catch(e=>{console.error(e);process.exitCode=1;});
