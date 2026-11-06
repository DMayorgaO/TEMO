// All browser APIs are intercepted. Payloads are checked by the actual backend calculation; no writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const {TransactionsService}=require('../../backend/dist/modules/transactions/transactions.service');
const {createTransactionBatchSchema}=require('../../backend/dist/modules/transactions/transaction-batch.schema');
const service=new TransactionsService({});
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333';
const shift={database_id:sid,id:'TUR-000100',estado:'ABIERTO',id_sucursal:sid,sucursal:'QA',caja:'QA',cajero:'QA',cambio_nio:'0',
 cashCounts:{ACTUAL:{NIO:{total:1000,lines:[]},USD:{total:100,lines:[]}}},expectedCash:{NIO:1000,USD:100},expectedGeneralRate:36.4,balances:[],
 availableAccounts:['BANPRO','LAFISE'].map(entity=>({account_id:entity,account:entity+' USD',entity,currency:'USD'})),
 availableMovements:[{entity:'BANPRO',code:'RE',name:'Retiro',direction:'Salida',accountDirection:'Ingreso',affectsAccount:true,currencies:['USD']},
 {entity:'LAFISE',code:'DC',name:'Deposito',direction:'Ingreso',accountDirection:'Salida',affectsAccount:true,currencies:['USD']}]};
(async()=>{const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
try{for(const [amount,change]of [[34.31,.43],[34.34,1.54]]){
 const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
 const user={id:uid,fullName:'QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_TRANSACTIONS','VER_CASH_COUNT']};
 await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-compensation-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
 const errors=[],attempts=[];
 await context.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname.replace(/^.*\/api/,'');let body=[];
  if(p==='/auth/me')body={user};else if(p==='/shifts/access')body={active:shift,prepared:null};
  else if(p==='/shifts/current')body=shift;else if(p==='/shifts')body=[shift];
  else if(p==='/transactions/table')body={rows:[],total:0,totals:{}};
  else if(p==='/transactions/pending')body=[{database_id:pid,id:'PEN-000001',tipo:'POR_COBRAR',estado:'PENDIENTE',saldo_pendiente:'26.92',moneda:'USD',contraparte:'CLIENTE QA',fecha_creacion:new Date().toISOString(),sucursal:'QA',cajero:'QA'}];
  else if(p==='/transactions/batch'){
   const input=createTransactionBatchSchema.parse(req.postDataJSON());attempts.push(input);
   assert.deepEqual(input.pendingSettlementIds,[pid]);assert.equal(input.transactions[0].amount,amount);assert.equal(input.transactions[1].amount,40);
   assert.equal(input.transactions[1].settlement.changeRateKind,'VENTA');assert.ok(Math.abs(input.transactions[1].settlement.expectedChange.NIO-change)<.00001);
   service.validateCompensatedGroup(input,['SALE','ENTRA'],{NIO:0,USD:26.92});
   await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'QA: calculo validado, sin guardar movimientos.'})});return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3188/#/transacciones');await page.getByRole('button',{name:'Agregar',exact:true}).click();
 const modal=page.locator('.transaction-modal-panel');await modal.locator('.transaction-form-movement select').selectOption({label:'Retiro'});
 await modal.locator('[data-transaction-amount]').fill(String(amount));
 await modal.getByRole('button',{name:'Liquidar pendientes',exact:true}).click();
 await modal.locator('.transaction-pending-settlement__list input[type="checkbox"]').check();
 await modal.locator('.transaction-tabs__add').click();
 await modal.locator('.transaction-form-bank select').selectOption('LAFISE');
 await modal.locator('.transaction-form-movement select').selectOption({label:'Deposito'});
 await modal.locator('[data-transaction-amount]').fill('40');
 const cell=(currency,row)=>modal.locator(`[data-cash-scope="received"][data-cash-currency="${currency}"][data-cash-row="${row}"][data-cash-column="1"]`);
 await cell('NIO',5).fill('1');await cell('NIO',8).fill('3');await cell('USD',2).fill('1');await cell('USD',4).fill('2');await cell('USD',5).fill('2');
 await modal.getByRole('button',{name:'Guardar 2 transacciones',exact:true}).click();
 await modal.getByText('QA: calculo validado, sin guardar movimientos.',{exact:true}).waitFor();
 assert.equal(attempts.length,1);assert.deepEqual(errors,[]);
 await page.screenshot({path:`tmp/pending-compensation-${amount}.png`,fullPage:true});await context.close();
 }}finally{await browser.close();}console.log('Both exact browser payloads pass the backend calculation; no financial writes.');})().catch(e=>{console.error(e);process.exitCode=1;});
