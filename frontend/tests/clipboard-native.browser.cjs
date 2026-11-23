const {transactionTableFixture}=require('./transaction-table-fixture.cjs');
// Synthetic records and intercepted requests only. No financial operations are sent.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const today='2026-10-29',now=`${today}T16:00:00Z`,currencies=['NIO','USD'];
const cash={NIO:{total:1000,lines:[{denomination:100,piles25:0,loose:10}]},USD:{total:100,lines:[{denomination:100,piles25:0,loose:1}]}};
const shift={database_id:id,id:'TUR-000001',estado:'ABIERTO',id_sucursal:id,sucursal:'SUCURSAL QA',caja:'Caja QA',cajero:'CAJERA QA',fecha_apertura:now,cambio_nio:'0',efectivo_inicial_nio:'1000',efectivo_inicial_usd:'100',efectivo_final_nio:null,efectivo_final_usd:null,
  cashCounts:{ACTUAL:cash},expectedCash:{NIO:1000,USD:100},expectedGeneral:{NIO:4640,USD:127.47},expectedGeneralRate:36.4,pendingCash:{NIO:0,USD:0},availableAccounts:[],availableMovements:[],balances:currencies.map(currency=>({account_id:currency==='NIO'?id:other,account:`BAC ${currency}`,entity:'BAC',currency,initial:'100',income:'0',expense:'0',calculated:'100',system:'100',difference:'0'}))};
shift.balances=[
 {account_id:id,account:'BANPRO NIO',entity:'BANPRO',currency:'NIO',initial:'100',income:'0',expense:'0',calculated:'100',system:'8412.64'},
 {account_id:other,account:'TELEDOLAR USD',entity:'TELEDOLAR',currency:'USD',initial:'0',income:'260',expense:'754',calculated:'-494',system:'-464',system_income:'260',system_expense:'724'},
];
const directory={database_id:id,id:'DIR-00001',name:'PERSONA QA',status:'ACTIVO',identifiers:[{institution:'QA',type:'Cuenta',number:'10-0100-0834-9686',currency:'NIO'},{institution:'QA',type:'Tarjeta',number:'4589-5359-9020-1614',currency:'USD'}],identities:[{number:'001-291075-0011a',holder:'TITULAR QA'}],references:['NO COPIAR'],observations:''};
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 try{for(const width of [1366]){
  const context=await browser.newContext({viewport:{width,height:width===1366?768:1080},timezoneId:'America/Managua',permissions:['clipboard-read','clipboard-write']});
  const user={id,fullName:'QA',roleCode:'JEFA',roleName:'Administrador',permissions:['VER_CASH_COUNT','VER_TRANSACTIONS','VER_DIRECTORY']};
  await context.addInitScript(user=>{
   sessionStorage.setItem('temo:auth-token','synthetic-copy');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));
  },user);
  const errors=[],writes=[];
  await context.route('**/api/**',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname.replace(/^.*\/api/,'');let result=[];
   if(req.method()!=='GET')writes.push(p);
   if(p==='/auth/me')result={user};else if(p==='/shifts')result=[shift];
   else if(p==='/shifts/current'||p===`/shifts/${id}`)result=shift;
   else if(p==='/shifts/access')result={active:shift,prepared:null};
   else if(p==='/directory')result=[directory];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(transactionTableFixture(req.url(),result))});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3188/#/arqueo');
  const bank=page.getByRole('button',{name:'Copiar diferencia de BANPRO NIO',exact:true});
  await bank.dblclick();await bank.getByRole('status').waitFor();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'En BANPRO *Sobra C$ 8,312.64*');
  await page.goto('http://127.0.0.1:3188/#/transacciones');
  await page.locator('article').getByRole('button',{name:'Directorio',exact:true}).click();
  const lookup=page.getByRole('dialog',{name:'Directorio de destinatarios'});
  const number=lookup.getByRole('button',{name:'Copiar número sin guiones',exact:true}).first();
  await number.dblclick();await number.getByRole('status').waitFor();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'10010008349686');
  // Preserve a native read method while disabling the modern write path only.
  await page.evaluate(()=>{window.readNativeClipboard=navigator.clipboard.readText.bind(navigator.clipboard);Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});});
  await lookup.getByRole('button',{name:'Copiar cédula sin guiones'}).dblclick();
  assert.equal(await page.evaluate(()=>window.readNativeClipboard()),'0012910750011A');
  if(process.env.TEMO_TEST_LAN_URL){
   const lan=await context.newPage();lan.on('pageerror',e=>errors.push(e.message));
   await lan.goto(process.env.TEMO_TEST_LAN_URL+'/#/arqueo');
   assert.equal(await lan.evaluate(()=>window.isSecureContext),false);
   assert.equal(await lan.evaluate(()=>Boolean(navigator.clipboard)),false);
   const target=lan.getByRole('button',{name:'Copiar diferencia de BANPRO NIO',exact:true});
   await target.dblclick();await target.getByRole('status').waitFor();
   await page.bringToFront();assert.equal(await page.evaluate(()=>window.readNativeClipboard()),'En BANPRO *Sobra C$ 8,312.64*');
   await lan.bringToFront();await lan.goto(process.env.TEMO_TEST_LAN_URL+'/#/transacciones');
   await lan.locator('article').getByRole('button',{name:'Directorio',exact:true}).click();
   await lan.getByRole('button',{name:'Copiar cédula sin guiones'}).dblclick();
   await page.bringToFront();assert.equal(await page.evaluate(()=>window.readNativeClipboard()),'0012910750011A');
   await lan.close();console.log('Native clipboard over insecure local-network HTTP passed.');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await context.close();
 }
 console.log('Native browser clipboard: bank, directory number and real execCommand fallback passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
