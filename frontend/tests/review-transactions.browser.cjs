const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const userId='11111111-1111-4111-8111-111111111111';
const reviewId='22222222-2222-4222-8222-222222222222',openId='33333333-3333-4333-8333-333333333333';
const counts={NIO:{total:1000,lines:[{denomination:100,piles25:0,loose:10}]},USD:{total:0,lines:[]}};
const review={database_id:reviewId,id:'TUR-000100',estado:'EN_REVISION',id_sucursal:reviewId,sucursal:'SUCURSAL QA',caja:'Caja QA',cajero:'SALIENTE QA',cambio_nio:'0',
  cashCounts:{ACTUAL:counts},expectedCash:{NIO:1000,USD:0},expectedGeneralRate:36.4,balances:[],
  availableAccounts:[{account_id:reviewId,account:'BAC NIO',entity:'BAC',currency:'NIO'}],
  availableMovements:[{entity:'BAC',code:'DC',name:'Deposito',direction:'Ingreso',accountDirection:'Ingreso',affectsAccount:true,currencies:['NIO']}]};
const open={...review,database_id:openId,id:'TUR-000101',estado:'ABIERTO'};
(async()=>{
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const errors=[],attempts=[],transferAttempts=[],acknowledgements=[];let sent,acknowledge=false;
  try{
    const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
    const user={id:userId,fullName:'SALIENTE QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_CASH_COUNT','VER_TRANSACTIONS','VER_TRANSFERS']};
    await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
    await context.route('**/api/**',async route=>{
      const r=route.request(),p=new URL(r.url()).pathname.replace(/^.*\/api/,'');let body=[];
      if(p==='/auth/me')body={user};
      else if(p==='/shifts/access')body={active:open,prepared:null};
      else if(p==='/shifts')body=[open,review];
      else if(p==='/shifts/current'||p===`/shifts/${openId}`)body=open;
      else if(p===`/shifts/${reviewId}`)body=review;
      else if(p==='/transactions'&&acknowledge)body=[{database_id:'55555555-5555-4555-8555-555555555555',id:'TRA-000042-01',id_grupo_transacciones:'44444444-4444-4444-8444-444444444444',codigo_operacion:'42',orden_grupo:1,fecha_transaccion:new Date().toISOString(),monto:'30',moneda:'NIO',direccion:'ENTRA',estado:'REGISTRADA',entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:'SALIENTE QA',sucursal:'SUCURSAL QA',descripcion:'Estado actual verificado',liquidacion:{}}];
      else if(p==='/transfers/context')body={shifts:[{id:openId,code:open.id,branch_id:reviewId,branch:open.sucursal,cashier:open.cajero,register:open.caja}],accounts:[]};
      else if(p==='/transfers'&&r.method()==='POST'){
        transferAttempts.push(r.postDataJSON());
        if(transferAttempts.length===1){await route.abort('connectionclosed');return;}
        await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Transferencia interceptada sin guardar datos.'})});return;
      }
      else if(p==='/transactions/batch'&&r.method()==='POST'){
        sent=r.postDataJSON();attempts.push(sent);
        if(acknowledge){
          acknowledgements.push(sent);
          if(acknowledgements.length===1){await route.abort('connectionclosed');return;}
          body={groupId:'44444444-4444-4444-8444-444444444444',operationCode:42,createdAt:new Date().toISOString(),transactions:[{id:'55555555-5555-4555-8555-555555555555',order:1,entityCode:'BAC',movementCode:'DC',movement:'Deposito',currencyCode:'NIO',amount:10,direction:'ENTRA',pendingName:'',description:''}],settlement:{primaryDirection:'ENTRA',primaryTotals:{NIO:10,USD:0},changeTotals:{NIO:0,USD:0}}};
          await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
        }
        if(attempts.length===1){await route.abort('connectionclosed');return;}
        await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Envio interceptado para comprobar el turno, sin guardar datos.'})});return;
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:3188/#/transacciones');
    await page.getByLabel('Turno de la transacción').selectOption(reviewId);
    await page.getByRole('button',{name:'Agregar',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.locator('.transaction-form-movement select').selectOption({label:'Deposito'});
    await dialog.locator('[data-transaction-amount]').fill('10');
    await dialog.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]').fill('1');
    await dialog.getByRole('button',{name:'Guardar',exact:true}).evaluate(button=>{button.click();button.click();});
    await dialog.getByText(/RED-CON-002/).waitFor();
    assert.equal(attempts.length,1,'Synchronous double click must not send two writes');
    const requestId=attempts[0].requestId;
    assert.match(requestId,/^[a-f0-9-]{36}$/);
    await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
    await dialog.getByText('Envio interceptado para comprobar el turno, sin guardar datos.').waitFor();
    assert.equal(sent.shiftId,reviewId,'Correction is explicitly bound to the review shift, not the newer open shift');
    assert.equal(sent.transactions[0].amount,10);
    assert.equal(attempts.length,2);
    assert.equal(sent.requestId,requestId,'Explicit retry after lost response retains the original reference');
    await dialog.locator('[data-transaction-amount]').fill('20');
    await dialog.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]').fill('2');
    const changedResponse=page.waitForResponse(response=>response.url().endsWith('/transactions/batch')&&response.status()===400);
    await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
    await changedResponse;
    assert.equal(attempts.length,3);
    assert.equal(attempts.at(-1).requestId,requestId,'Editing after an uncertain save must not bypass server conflict checks with a new key');
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.getByRole('button',{name:'Agregar',exact:true}).click();
    await dialog.locator('.transaction-form-movement select').selectOption({label:'Deposito'});
    await dialog.locator('[data-transaction-amount]').fill('10');
    await dialog.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]').fill('1');
    const newResponse=page.waitForResponse(response=>response.url().endsWith('/transactions/batch')&&response.status()===400);
    await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await newResponse;
    assert.notEqual(attempts.at(-1).requestId,requestId,'An explicitly new form gets its own operation reference');
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
    await page.goto('http://127.0.0.1:3188/#/transferencias');
    await page.getByRole('heading',{name:'Transferencias registradas',exact:true}).waitFor();
    await page.getByRole('button',{name:'Agregar',exact:true}).click();
    const transfer=page.locator('.transfer-modal');
    await transfer.locator('[data-cash-scope="transfer-cash"][data-cash-currency="NIO"][data-cash-row="3"][data-cash-column="1"]').fill('1');
    await transfer.getByRole('button',{name:'Guardar',exact:true}).evaluate(button=>{button.click();button.click();});
    await transfer.getByText(/RED-CON-002/).waitFor();
    assert.equal(transferAttempts.length,1);
    await transfer.getByRole('button',{name:'Guardar',exact:true}).click();
    await transfer.getByText('Transferencia interceptada sin guardar datos.').waitFor();
    assert.equal(transferAttempts.length,2);
    assert.equal(transferAttempts[0].requestId,transferAttempts[1].requestId);
    assert.equal(transferAttempts[0].amount,100);
    await transfer.getByRole('button',{name:'Cancelar',exact:true}).click();
    acknowledge=true;
    await page.goto('http://127.0.0.1:3188/#/transacciones');
    await page.getByLabel('Turno de la transacción').waitFor();
    await page.getByRole('button',{name:'Agregar',exact:true}).click();
    await dialog.locator('.transaction-form-movement select').selectOption({label:'Deposito'});
    await dialog.locator('[data-transaction-amount]').fill('10');
    await dialog.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]').fill('1');
    await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
    await dialog.getByText(/RED-CON-002/).waitFor();
    await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(acknowledgements[0].requestId,acknowledgements[1].requestId);
    const stored=page.locator('tbody tr').filter({hasText:'TRA-000042-01'});
    assert.equal(await stored.count(),1,'A replay acknowledgement does not append a duplicate table row');
    assert.ok((await stored.innerText()).includes('30.00'),'Table shows the current server value, not the old receipt amount');
    assert.deepEqual(errors,[]);
    console.log('Financial UI passed: explicit review target, synchronous double-click protection, lost-response manual retries keep reference, changed drafts retain key, new form rotates key; cash transfers also covered.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
