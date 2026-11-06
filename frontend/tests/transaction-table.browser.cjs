const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/LEGION/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const id='11111111-1111-4111-8111-111111111111';
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});const measurements=[];
try{for(const width of [1366,1920]){
 const context=await browser.newContext({viewport:{width,height:width===1366?768:1080},timezoneId:'America/Managua'});
 const user={id,fullName:'TABLE QA',roleCode:'JEFA',roleName:'Administrador',permissions:['VER_TRANSACTIONS']};
 await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-table-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
 const calls=[],errors=[];let heldResolve,hold=false,active=0,maxActive=0,bytes=0;
 const rows=Array.from({length:100000},(_,i)=>({database_id:`22222222-2222-4222-8222-${String(i+1).padStart(12,'0')}`,id:`TRA-${String(i+1).padStart(6,'0')}-01`,edit_version:'1',id_grupo_transacciones:id,codigo_operacion:i+1,orden_grupo:1,fecha_transaccion:'2026-10-30T16:00:00Z',monto:'100',moneda:i%2?'USD':'NIO',direccion:'ENTRA',estado:'REGISTRADA',entidad:i%2?'BAC':'LAFISE',codigo_movimiento:'DC',movimiento:'Deposito',cajero:'QA',sucursal:'QA',descripcion:''}));
 await context.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.replace(/^.*\/api/,'');let body=[];
  if(p==='/auth/me')body={user};else if(p==='/shifts/current')body=null;
  else if(p==='/transactions')throw Error('Full-history endpoint must not be requested');
  else if(p==='/transactions/table'){
   calls.push(Object.fromEntries(url.searchParams));active++;maxActive=Math.max(maxActive,active);
   let filtered=rows;if(url.searchParams.get('currency'))filtered=filtered.filter(r=>r.moneda===url.searchParams.get('currency'));
   if(url.searchParams.get('search'))filtered=filtered.filter(r=>r.id.includes(url.searchParams.get('search')));
   const offset=Number(url.searchParams.get('offset')),limit=Number(url.searchParams.get('limit'));
   body={total:filtered.length,rows:filtered.slice(offset,offset+limit),totals:{}};
   if(hold){hold=false;await new Promise(resolve=>{heldResolve=resolve;});}
   active--;bytes+=Buffer.byteLength(JSON.stringify(body));
  }else if(p==='/transactions/export-filtered'){
   const input=req.postDataJSON();assert.equal(input.query.currency,'USD');assert.equal(input.query.search,'TRA-0000');
   body=rows.filter(r=>r.moneda==='USD'&&r.id.includes('TRA-0000'));
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const start=performance.now();await page.goto('http://127.0.0.1:3188/#/transacciones');await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===10);
 measurements.push({width,records:100000,timeToRowsMs:performance.now()-start,requests:calls.length,bytes});assert.equal(calls.length,1);assert.ok((await page.locator('.pagination-bar').innerText()).includes('100000 registros'));
 const pagination=page.locator('.pagination-bar');await pagination.locator('button').last().click();await page.waitForFunction(()=>document.querySelector('tbody')?.textContent.includes('TRA-099991-01'));
 assert.equal(calls.at(-1).offset,'99990');assert.equal(calls.length,2,'Last page does not download previous pages');
 await page.getByRole('group',{name:'Filtrar por moneda',exact:true}).getByRole('button',{name:'$',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.pagination-bar')?.textContent.includes('50000 registros'));
 assert.equal(calls.at(-1).offset,'0');
 // Hold one poll and emit repeated refresh events; no overlapping poll downloads.
 hold=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));while(!heldResolve)await page.waitForTimeout(10);
 const before=calls.length;await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(250);assert.equal(calls.length,before);
 // Change filter while the old response is held. Releasing it must not replace new results.
 await page.locator('[name="transaction-search"]').fill('TRA-0000');
 await page.waitForFunction(()=>document.querySelector('.pagination-bar')?.textContent.includes('49 registros'));
 heldResolve();await page.waitForTimeout(250);assert.ok((await pagination.innerText()).includes('49 registros'));
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Excel',exact:true}).click();const file=await download;const filename=await file.path();const html=fs.readFileSync(filename,'utf8');assert.ok(html.includes('TRA-000098-01'),'Export contains rows beyond page');
 await page.screenshot({path:`tmp/transaction-table-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();}console.log(JSON.stringify({ok:true,measurements}));})().catch(e=>{console.error(e);process.exitCode=1;});
