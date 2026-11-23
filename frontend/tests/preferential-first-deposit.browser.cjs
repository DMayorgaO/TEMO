// All HTTP is intercepted; no financial writes reach a real account.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const {TransactionsService}=require('../../backend/dist/modules/transactions/transactions.service');
const {createTransactionBatchSchema}=require('../../backend/dist/modules/transactions/transaction-batch.schema');
const service=new TransactionsService({});
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const shift={database_id:sid,id:'TUR-000100',estado:'ABIERTO',sucursal:'QA',caja:'QA',cajero:'QA',cambio_nio:'0',balances:[],
 cashCounts:{ACTUAL:{NIO:{total:5000,lines:[]},USD:{total:100,lines:[]}}},expectedCash:{NIO:5000,USD:100},expectedGeneralRate:36.4,
 availableAccounts:['NIO','USD'].map(currency=>({account_id:currency,account:'BAC '+currency,entity:'BAC',currency})),
 availableMovements:[{entity:'BAC',code:'RE',name:'Retiro',direction:'Salida',accountDirection:'Ingreso',affectsAccount:true,currencies:['NIO','USD']},
 {entity:'BAC',code:'DC',name:'Deposito',direction:'Ingreso',accountDirection:'Salida',affectsAccount:true,currencies:['NIO','USD']}]};
(async()=>{const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
try{for(const [width,height]of [[1366,768],[1920,1080]]){
 const context=await browser.newContext({viewport:{width,height},timezoneId:'America/Managua'});
 const user={id:uid,fullName:'QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_TRANSACTIONS','VER_CASH_COUNT']};
 await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-preferential-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));localStorage.setItem('temo:exchange-rate',JSON.stringify({buy:'36.40',sell:'37.00'}));},user);
 const errors=[],attempts=[],edits=[],payments=[];let pendingMode=false;
 const transaction=()=>({database_id:uid,id:'TRA-000100-01',id_grupo_transacciones:sid,orden_grupo:1,shift_id:sid,fecha_transaccion:new Date().toISOString(),monto:'3655',moneda:'NIO',direccion:'ENTRA',estado:'REGISTRADA',entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:'QA',sucursal:'QA',descripcion:'Fixture',liquidacion:{},...(pendingMode?{estado:'PENDIENTE',pending_database_id:sid,pending_type:'POR_COBRAR',pending_status:'PENDIENTE',pending_balance:'3655',pendiente:'CLIENTE QA'}:{})});
 await context.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.replace(/^.*\/api/,'');let body=[];
  if(p==='/auth/me')body={user};else if(p==='/shifts/access')body={active:shift,prepared:null};
  else if(p==='/shifts/current')body=shift;else if(p==='/shifts')body=[shift];
  else if(p==='/transactions/table')body={rows:attempts.length?[transaction()]:[],total:attempts.length?1:0,totals:{}};
  else if(p.endsWith('/detail'))body={transaction:transaction(),rates:{buy:36.55,sell:37},settlement:{...attempts[0].transactions[0].settlement,primaryCounts:{NIO:[],USD:[]},changeCounts:{NIO:[],USD:[]}}};
  else if(p.endsWith('/pay')){payments.push(req.postDataJSON());assert.deepEqual(payments[0].rates,{buy:36.4,sell:37});body={success:true};}
  else if(p.endsWith('/group-detail'))body={editVersion:'1',details:[{editVersion:'1',transaction:transaction(),rates:{buy:36.55,sell:37},settlement:{...attempts[0].transactions[0].settlement,independent:true,primaryDirection:'ENTRA'}}],compensations:[]};
  else if(req.method()==='PUT'&&p.endsWith('/group')){const input=req.postDataJSON();edits.push(input);assert.equal(input.preferential,false);assert.deepEqual(input.updates[0].data.rates,{buy:36.4,sell:37});body={updated:1,voided:0};}
  else if(p==='/transactions/batch'){
   const input=createTransactionBatchSchema.parse(req.postDataJSON());attempts.push(input);
   assert.deepEqual(input.rates,{buy:36.4,sell:37});
   const balance={NIO:0,USD:0};for(const row of input.transactions)service.assertChangeRateRule(input,row,'ENTRA',balance);
   assert.ok(Math.abs(balance.NIO)<.00001&&Math.abs(balance.USD)<.00001);
   body={groupId:sid,transactions:[{id:uid}]};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3188/#/transacciones');
 const modal=page.locator('.transaction-modal-panel');
 const open=async()=>{
  await page.getByRole('button',{name:'Agregar',exact:true}).click();
  await modal.locator('.transaction-form-movement select').selectOption({label:'Deposito'});
  await modal.locator('[data-transaction-currency="NIO"]').click();
  await modal.locator('[data-transaction-amount]').fill('3655');
 };
 await open();const button=modal.getByRole('button',{name:'D',exact:true});
 assert.equal(await button.count(),1);assert.equal(await button.getAttribute('aria-pressed'),'false');
 await modal.locator('[data-cash-scope="received"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="1"]').fill('1');
 await button.click();await page.locator('.system-dialog-backdrop').getByRole('button',{name:'Confirmar',exact:true}).click();
 assert.equal(await button.getAttribute('aria-pressed'),'true');
 await modal.getByRole('status',{name:'Cuenta del cliente equilibrada',exact:true}).waitFor();
 assert.ok((await modal.locator('.transaction-rate-chip strong').first().innerText()).includes('36.55'));
 await button.click();await modal.getByRole('status',{name:'Pendiente por recibir del cliente',exact:true}).waitFor();
 await button.click();await page.locator('.system-dialog-backdrop').getByRole('button',{name:'Confirmar',exact:true}).click();
 await page.screenshot({path:`tmp/preferential-first-${width}.png`,fullPage:true});
 await modal.getByRole('button',{name:'Guardar',exact:true}).click();await modal.waitFor({state:'hidden'});
 assert.equal(attempts[0].specialExchangeRate,36.55);assert.equal(attempts[0].specialExchangeRateKind,undefined);
 assert.equal(attempts[0].transactions.length,1);
 await page.locator('tbody tr').filter({hasText:'TRA-000100-01'}).getByTitle('Editar',{exact:true}).click();
 assert.equal(await button.getAttribute('aria-pressed'),'true');
 await button.click();
 await modal.locator('[data-transaction-amount]').fill('3640');
 await modal.getByRole('button',{name:'Guardar',exact:true}).click();await modal.waitFor({state:'hidden'});assert.equal(edits.length,1);
 await open();assert.equal(await button.getAttribute('aria-pressed'),'false');
 await modal.locator('[data-transaction-currency="USD"]').click();await modal.locator('[data-transaction-amount]').fill('100');
 await modal.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="8"][data-cash-column="1"]').fill('3700');
 await modal.getByRole('status',{name:'Cuenta del cliente equilibrada',exact:true}).waitFor();
 await modal.getByRole('button',{name:'Guardar',exact:true}).click();await modal.waitFor({state:'hidden'});
 assert.equal(attempts[1].specialExchangeRate,undefined);assert.equal(attempts[1].specialExchangeRateKind,undefined);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('temo:exchange-rate'))),{buy:'36.40',sell:'37.00'});
 pendingMode=true;await page.reload();
 await page.locator('tbody tr').filter({hasText:'TRA-000100-01'}).getByTitle('Liquidar pendiente',{exact:true}).click();
 assert.equal(await button.count(),0);
 await modal.locator('[data-cash-scope="received"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="1"]').fill('1');
 await modal.getByRole('status',{name:'Pendiente por recibir del cliente',exact:true}).waitFor();
 assert.ok((await modal.locator('.transaction-rate-chip strong').first().innerText()).includes('36.40'));
 assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();}console.log('First-deposit D, toggling, exact payload and next-client reset verified at both desktop sizes.');})().catch(e=>{console.error(e);process.exitCode=1;});
