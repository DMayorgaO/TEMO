// All APIs intercepted. Simulate a committed write whose response never reaches the browser.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright'),assert=require('node:assert/strict');
const {directoryEntrySchema,directoryUpdateSchema}=require('../../backend/dist/modules/directory/directory.schema');
const id='11111111-1111-4111-8111-111111111111';
(async()=>{const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 try{for(const width of [1366,1920]){
  const context=await browser.newContext({viewport:{width,height:width===1366?768:1080}}),user={id,fullName:'QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_DIRECTORY','VER_TRANSACTIONS']};
  await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-directory-receipt');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
  let current=null,effects=0,failNext=true,rejectNext=false;const receipts=new Map(),attempts=[],errors=[];
  await context.route('**/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname.replace(/^.*\/api/,'');let body=p==='/shifts/current'?null:[];
   if(p==='/auth/me')body={user};else if(p==='/shifts/access')body={active:{database_id:id,estado:'ABIERTO',sucursal:'QA',caja:'QA'},prepared:null};
   else if(p==='/directory'||p===`/directory/${id}`){
    if(['POST','PUT'].includes(req.method())){
     const input=(req.method()==='POST'?directoryEntrySchema:directoryUpdateSchema).parse(req.postDataJSON());attempts.push(input);
     if(rejectNext){rejectNext=false;await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'QA: corrija el nombre.'})});return;}
     if(receipts.has(input.requestId)){assert.deepEqual(input,receipts.get(input.requestId));body=current;}
     else{effects++;current={...input,database_id:id,id:'DIR-00001',edit_version:String(effects).repeat(64),sources:[]};receipts.set(input.requestId,input);body=current;}
     if(failNext){failNext=false;await route.abort('failed');return;}
    }else body=p==='/directory'?(current?[current]:[]):current;
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3188/#/directorio');
  await page.getByRole('button',{name:'Agregar',exact:true}).click();let dialog=page.locator('.directory-modal');
  await dialog.getByLabel('Nombre',{exact:true}).fill('PRIMER GUARDADO');await dialog.getByPlaceholder('Numero',{exact:true}).fill('12345678');
  await dialog.getByTitle('Agregar numero').click();await dialog.getByPlaceholder('Numero',{exact:true}).nth(1).fill('87654321');
  await dialog.getByRole('button',{name:'Subir numero 2',exact:true}).click();
  assert.equal(await dialog.getByPlaceholder('Numero',{exact:true}).first().inputValue(),'87654321');
  assert.equal(await dialog.getByRole('button',{name:'Subir numero 1',exact:true}).isDisabled(),true);
  assert.equal(await dialog.getByRole('button',{name:'Bajar numero 2',exact:true}).isDisabled(),true);
  const ids=dialog.locator('.directory-secondary-grid section').first();
  await ids.getByRole('button').first().click();
  await ids.getByPlaceholder('000-000000-0000A').first().fill('001-010101-0001A');
  await ids.getByPlaceholder('Titular (opcional)').first().fill('PRIMERO');
  await ids.getByRole('button').first().click();
  await ids.getByPlaceholder('000-000000-0000A').nth(1).fill('002-010101-0002A');
  await ids.getByPlaceholder('Titular (opcional)').nth(1).fill('SEGUNDO');
  await ids.getByRole('button',{name:'Subir cedula 2',exact:true}).click();
  assert.equal(await ids.getByPlaceholder('Titular (opcional)').first().inputValue(),'SEGUNDO');
  await dialog.getByRole('button',{name:'Guardar',exact:true}).dblclick();
  await dialog.getByRole('button',{name:'Reintentar guardado',exact:true}).waitFor();
  assert.equal(effects,1);assert.equal(attempts.length,1);assert.equal(await dialog.getByLabel('Nombre',{exact:true}).isDisabled(),true);
  assert.equal(await dialog.getByLabel('Nombre',{exact:true}).inputValue(),'PRIMER GUARDADO');
  await page.screenshot({path:`tmp/directory-retry-${width}.png`,fullPage:true});
  await dialog.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(effects,1);assert.deepEqual(attempts[0],attempts[1]);
  await page.getByTitle('Editar',{exact:true}).click();dialog=page.locator('.directory-modal');
  assert.equal(await dialog.getByPlaceholder('Numero',{exact:true}).first().inputValue().then(v=>v.replace(/-/g,'')),'87654321');
  assert.equal(await dialog.getByPlaceholder('Titular (opcional)').first().inputValue(),'SEGUNDO');
  await dialog.screenshot({path:`tmp/directory-order-${width}.png`});
  await dialog.getByLabel('Nombre',{exact:true}).fill('EDITAR RECHAZADO');rejectNext=true;
  await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await dialog.getByText('QA: corrija el nombre.',{exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('Nombre',{exact:true}).isDisabled(),false);
  await dialog.getByLabel('Nombre',{exact:true}).fill('EDITADO CONFIRMADO');failNext=true;
  await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await dialog.getByRole('button',{name:'Reintentar guardado',exact:true}).waitFor();
  assert.notEqual(attempts[2].requestId,attempts[3].requestId);assert.equal(effects,2);
  await dialog.getByRole('button',{name:'Reintentar guardado',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(effects,2);assert.deepEqual(attempts[3],attempts[4]);
  await page.goto('http://127.0.0.1:3188/#/transacciones');
  await page.locator('article').getByRole('button',{name:'Directorio',exact:true}).click();
  const lookup=page.getByRole('dialog',{name:'Directorio de destinatarios'});
  await lookup.getByText('EDITADO CONFIRMADO',{exact:true}).waitFor();
  assert.match(await lookup.locator('.directory-number').first().innerText(),/87654321/);
  assert.match(await lookup.locator('.directory-lines > span').first().innerText(),/SEGUNDO/);
  await page.goto('http://127.0.0.1:3188/#/directorio');
  failNext=true;
  await page.getByTitle('Anular',{exact:true}).click();await page.locator('.system-dialog').getByRole('button',{name:'Anular',exact:true}).click();
  await page.locator('.transaction-save-error').waitFor();assert.equal(effects,3);
  await page.getByTitle('Anular',{exact:true}).click();await page.locator('.system-dialog').getByRole('button',{name:'Anular',exact:true}).click();
  await page.getByText('No hay registros que coincidan con la busqueda.',{exact:true}).waitFor();assert.equal(effects,3);
  assert.equal(current.status,'INACTIVO');assert.match(attempts.at(-1).requestId,/^[a-f0-9-]{36}$/);
  assert.deepEqual(attempts.at(-1),attempts.at(-2));
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();}console.log('Directory lost-response create/edit, same-reference retry, corrected validation and deactivation passed at both desktop sizes.');})().catch(e=>{console.error(e);process.exitCode=1;});
