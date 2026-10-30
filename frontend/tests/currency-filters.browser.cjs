// Synthetic records and intercepted requests only. No financial operations are sent.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const today='2026-10-29',now=`${today}T16:00:00Z`,currencies=['NIO','USD'];
const cash={NIO:{total:1000,lines:[{denomination:100,piles25:0,loose:10}]},USD:{total:100,lines:[{denomination:100,piles25:0,loose:1}]}};
const shift={database_id:id,id:'TUR-000001',estado:'ABIERTO',id_sucursal:id,sucursal:'SUCURSAL QA',caja:'Caja QA',cajero:'CAJERA QA',fecha_apertura:now,cambio_nio:'0',efectivo_inicial_nio:'1000',efectivo_inicial_usd:'100',efectivo_final_nio:null,efectivo_final_usd:null,
  cashCounts:{ACTUAL:cash},expectedCash:{NIO:1000,USD:100},expectedGeneral:{NIO:4640,USD:127.47},expectedGeneralRate:36.4,pendingCash:{NIO:0,USD:0},availableAccounts:[],availableMovements:[],balances:currencies.map(currency=>({account_id:currency==='NIO'?id:other,account:`BAC ${currency}`,entity:'BAC',currency,initial:'100',income:'0',expense:'0',calculated:'100',system:'100',difference:'0'}))};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
  const user={id,fullName:'ADMIN QA',roleCode:'JEFA',roleName:'Administrador',permissions:['TRANSFERS','PENDING','TRANSACTIONS','CASH_COUNT','SHIFTS','DOLLAR_PURCHASES','ACCOUNTS','COMMISSIONS','COMMISSION_REPORTS'].map(code=>`VER_${code}`)};
  await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-currency-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
  const writes=[],errors=[];
  let holdCurrent=false,releaseCurrent,holdDetail=false,releaseDetail,detailRequests=0;
  await context.route('**/api/**',async route=>{
   const request=route.request(),p=new URL(request.url()).pathname.replace(/^.*\/api/,'');let body=[];
   if(p==='/shifts/current'&&holdCurrent)await new Promise(resolve=>{releaseCurrent=resolve;});
   if(p===`/shifts/${id}`){detailRequests++;if(holdDetail)await new Promise(resolve=>{releaseDetail=resolve;});}
   if(request.method()!=='GET')writes.push(p);
   if(p==='/auth/me')body={user};
   else if(p==='/shifts/access')body={active:shift,prepared:null};
   else if(p==='/shifts/current'||p===`/shifts/${id}`)body=shift;
   else if(p==='/shifts')body=[shift];
   else if(p==='/catalogs/sucursales')body=[{id_sucursal:id,nombre:shift.sucursal,estado:'ACTIVO'}];
   else if(p==='/catalogs/cuentas-bancarias')body=currencies.map((moneda,index)=>({id:index?other:id,alias:`CUENTA QA ${moneda}`,entidad:'BAC',moneda,estado:'ACTIVO'}));
   else if(p==='/catalogs/reglas-comisiones')body=currencies.map((moneda,index)=>({id:index?other:id,entidad_bancaria:'BAC',movimiento:`COMISION QA ${moneda}`,moneda,moneda_comision:moneda,tipo_calculo:'FIJA',monto_fijo:'10',estado:'ACTIVO'}));
   else if(p==='/transactions')body=currencies.map((moneda,index)=>({database_id:index?other:id,id:`TRA-000001-0${index+1}`,edit_version:'1',id_grupo_transacciones:id,codigo_operacion:'1',orden_grupo:index+1,shift_id:id,fecha_transaccion:now,monto:'100',moneda,direccion:'ENTRA',estado:'REGISTRADA',entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:shift.cajero,sucursal:shift.sucursal,descripcion:''}));
   else if(p==='/transfers')body=currencies.map((moneda,index)=>({database_id:index?other:id,id:`TRF-00000${index+1}`,edit_version:'1',id_turno:id,fecha_transferencia:now,tipo:'EFECTIVO',direccion:'SALE',moneda,monto:'100',estado:'ACTIVO',cajero:shift.cajero,sucursal:shift.sucursal,caja:shift.caja}));
   else if(p==='/transfers/context')body={shifts:[],accounts:[]};
   else if(p==='/transactions/pending')body=currencies.map((moneda,index)=>({database_id:index?other:id,id:`PEN-00000${index+1}`,transaction_database_id:id,shift_database_id:id,transaction_id:'TRA-000001-01',tipo:'POR_COBRAR',estado:'PENDIENTE',monto_original:'100',saldo_pendiente:'100',fecha_creacion:now,fecha_modificacion:now,contraparte:`CLIENTE ${moneda}`,moneda,entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:shift.cajero,sucursal:shift.sucursal,estado_turno:'ABIERTO'}));
   else if(p==='/dollar-purchases')body=[{database_id:id,id:'TRA-000001-01',fecha_transaccion:now,monto_comprado_usd:'10',diferencia_nio:'6',tasa_compra_usada:'36.4',tasa_venta_usada:'37',cajero:shift.cajero,sucursal:shift.sucursal}];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  holdCurrent=true;
  await page.goto('http://127.0.0.1:3188/#/transacciones');
  await page.locator('tbody tr').first().waitFor();
  assert.equal(await page.locator('tbody tr').count(),2,'Transaction rows do not wait for the shift detail');
  assert.equal(typeof releaseCurrent,'function','Shift detail is still pending');
  holdCurrent=false;releaseCurrent();
  holdDetail=true;detailRequests=0;
  await page.goto('http://127.0.0.1:3188/#/arqueo');
  await page.getByRole('status').filter({hasText:'Cargando arqueo y saldos'}).waitFor();
  assert.equal(await page.locator('.cash-count-live-grid').count(),0,'No provisional zero cash table during loading');
  while(!releaseDetail)await page.waitForTimeout(10);
  holdDetail=false;releaseDetail();
  await page.locator('.cash-count-live-grid').waitFor();
  assert.equal(detailRequests,1,'Initial administrator cash view fetches its detail only once');
  for(const route of ['transferencias','transacciones','pendientes']){
   await page.goto(`http://127.0.0.1:3188/#/${route}`);
   const filter=page.getByRole('group',{name:'Filtrar por moneda',exact:true});await filter.waitFor();
   await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length>=2);
   if(route==='pendientes')await page.locator(`input[name="pending-select-${id}"]`).check();
   for(const currency of ['C$','$']){
    await filter.getByRole('button',{name:currency,exact:true}).click();
    assert.equal(await filter.getByRole('button',{name:currency,exact:true}).getAttribute('aria-pressed'),'true');
    const code=currency==='C$'?'000001':'000002';
    assert.ok((await page.locator('tbody').last().innerText()).includes(route==='transacciones'?`0${currency==='C$'?1:2}`:code));
    assert.equal(await page.locator('tbody tr').count(),1,`${route} filters rows by ${currency}`);
   }
   if(route==='pendientes')assert.equal(await page.getByRole('button',{name:'Digital',exact:true}).isDisabled(),true,'Changing currency clears pending bulk selections');
   await filter.getByRole('button',{name:'$',exact:true}).click();
   assert.equal(await page.locator('tbody tr').count(),2,`${route} restores both currencies`);
  }
  for(const route of ['cuentas','comisiones','reportes/comisiones']){
   await page.goto(`http://127.0.0.1:3188/#/${route}`);
   const filter=page.getByRole('group',{name:'Filtrar por moneda',exact:true});await filter.waitFor();
   await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===2);
   await filter.getByRole('button',{name:'C$',exact:true}).click();
   assert.equal(await page.locator('tbody tr').count(),1,`${route}: NIO only`);
   assert.ok((await page.locator('tbody').innerText()).includes('NIO'),`${route}: ${await page.locator('tbody').innerText()}`);
   await filter.getByRole('button',{name:'$',exact:true}).click();
   assert.equal(await page.locator('tbody tr').count(),1,`${route}: USD only`);
   assert.ok((await page.locator('tbody').innerText()).includes('USD'),`${route}: ${await page.locator('tbody').innerText()}`);
   await filter.getByRole('button',{name:'$',exact:true}).click();
   assert.equal(await page.locator('tbody tr').count(),2,`${route}: reset both`);
  }
  await page.goto('http://127.0.0.1:3188/#/arqueo');
  const filter=page.getByRole('group',{name:'Filtrar por moneda',exact:true});await filter.waitFor();
  await page.locator('.cash-workspace-balances .consolidation-card--usd').waitFor();
  const before=writes.length;
  await filter.getByRole('button',{name:'C$',exact:true}).click();
  assert.equal(await page.locator('.cash-workspace-balances .consolidation-card--usd').isVisible(),false);
  assert.equal(await page.locator('.cash-count-live-grid .transaction-cash-card--usd').isVisible(),false);
  await filter.getByRole('button',{name:'$',exact:true}).click();
  assert.equal(await page.locator('.cash-workspace-balances .consolidation-card--nio').isVisible(),false);
  assert.equal(await page.locator('.cash-count-live-grid .transaction-cash-card--nio').isVisible(),false);
  await filter.getByRole('button',{name:'$',exact:true}).click();
  assert.equal(await page.locator('.cash-count-live-grid .transaction-cash-card--nio').isVisible(),true);
  assert.equal(writes.length,before,'Currency views never save or clear financial values');
  await page.goto('http://127.0.0.1:3188/#/compra-dolares');await filter.waitFor();
  await filter.getByRole('button',{name:'C$',exact:true}).click();
  assert.equal(await page.locator('.dollar-purchase-table th[data-money-currency="USD"]').isVisible(),false);
  assert.equal(await page.locator('.dollar-purchase-table td[data-money-currency="NIO"]').isVisible(),true);
  await filter.getByRole('button',{name:'$',exact:true}).click();
  assert.equal(await page.locator('.dollar-purchase-table td[data-money-currency="NIO"]').isVisible(),false);
  assert.equal(await page.locator('.dollar-purchase-table td[data-money-currency="USD"]').isVisible(),true);
  await page.goto('http://127.0.0.1:3188/#/turnos');await filter.waitFor();
  await filter.getByRole('button',{name:'$',exact:true}).click();
  const shiftRow=page.locator('tbody tr').filter({hasText:'TUR-000001'});
  assert.ok(!(await shiftRow.innerText()).includes('C$'),'Shift list shows only the selected currency without changing shift data');
  assert.ok((await shiftRow.innerText()).includes('USD $ 100.00'));
  for(const [width,height]of [[1366,768],[1920,1080],[390,844]]){await page.setViewportSize({width,height});await page.screenshot({path:path.resolve(__dirname,`../../tmp/currency-filter-shifts-${width}.png`),fullPage:true});}
  assert.deepEqual(errors,[]);await context.close();console.log('Currency filters: rows, mixed columns, cash/balances, pending selection safety and no financial writes passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
