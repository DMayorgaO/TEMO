// Synthetic sessions and intercepted APIs only; no financial requests leave this browser fixture.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base='http://127.0.0.1:3188';
const userId='11111111-1111-4111-8111-111111111111',shiftId='22222222-2222-4222-8222-222222222222';
const ids=['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const transactionIds=['55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const date=new Date().toISOString();
const counts={NIO:{total:1000,lines:[{denomination:10,piles25:0,loose:100}]},USD:{total:0,lines:[]}};
const shift={database_id:shiftId,id:'TUR-000100',estado:'ABIERTO',id_sucursal:shiftId,sucursal:'SUCURSAL QA',caja:'Caja QA',cajero:'CAJERO QA',cambio_nio:'0',
  cashCounts:{ACTUAL:counts},expectedCash:{NIO:1000,USD:0},expectedGeneralRate:36.4,balances:[],
  availableAccounts:[{account_id:shiftId,account:'BAC NIO',entity:'BAC',currency:'NIO'}],
  availableMovements:[{entity:'BAC',code:'RE',name:'Recibo',direction:'Ingreso',accountDirection:'Ingreso',affectsAccount:true,currencies:['NIO']}]};
const pending=index=>({database_id:ids[index],id:`PEN-00000${index+1}`,transaction_database_id:transactionIds[index],shift_database_id:shiftId,
  transaction_id:`TRA-00000${index+1}-01`,tipo:'POR_COBRAR',estado:'PENDIENTE',monto_original:'10',saldo_pendiente:'10',fecha_creacion:date,fecha_modificacion:date,
  contraparte:'CLIENTE QA',moneda:'NIO',entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:'CAJERO QA',sucursal:shift.sucursal,estado_turno:'ABIERTO'});
const transaction=index=>({database_id:transactionIds[index],id:`TRA-00000${index+1}-01`,id_grupo_transacciones:transactionIds[index],orden_grupo:1,fecha_transaccion:date,
  monto:'10',moneda:'NIO',direccion:'ENTRA',estado:'PENDIENTE',entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:'CAJERO QA',sucursal:shift.sucursal,
  pending_database_id:ids[index],pending_type:'POR_COBRAR',pending_status:'PENDIENTE',pending_balance:'10',pendiente:'CLIENTE QA',descripcion:'Fixture',liquidacion:{}});
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try{
    for(const mode of ['single','cash','digital','mixed','transaction']){
      const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
      const user={id:userId,fullName:'CAJERO QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_PENDING','VER_TRANSACTIONS','VER_CASH_COUNT']};
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-local-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      const attempts=[],errors=[];let paid=false,pendingReads=0;
      await context.route('**/api/**',async route=>{
        const request=route.request(),p=new URL(request.url()).pathname.replace(/^.*\/api/,'');let body=[];
        if(request.method()==='POST'&&(p.endsWith('/pay')||p.endsWith('/pay-batch'))){
          attempts.push(request.postDataJSON());
          if(attempts.length===1){await route.abort('connectionclosed');return;}
          if(JSON.stringify(attempts.at(-1))!==JSON.stringify(attempts[0])){
            await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'La referencia ya fue aplicada con otros datos.'})});return;
          }
          paid=true;body={estado:'PAGADO',ids,method:'EFECTIVO'};
        }else if(p==='/auth/me')body={user};
        else if(p==='/shifts/access')body={active:shift,prepared:null};
        else if(p==='/shifts/current'||p===`/shifts/${shiftId}`)body=shift;
        else if(p==='/shifts')body=[shift];
        else if(p==='/transactions/pending'){pendingReads++;body=[0,1].map(index=>({...pending(index),...(paid?{estado:'PAGADO',saldo_pendiente:'0'}:{})}));}
        else if(p==='/transactions')body=[transaction(0)];
        else if(p.endsWith('/detail'))body={transaction:transaction(0),rates:{buy:36.4,sell:37},settlement:{primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:{NIO:[],USD:[]},changeCounts:{NIO:[],USD:[]}}};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${base}/#/${mode==='transaction'?'transacciones':'pendientes'}`);
      if(mode==='transaction')await page.getByTitle('Liquidar pendiente',{exact:true}).click();
      else if(mode==='single')await page.locator('.pending-table tbody tr').first().getByTitle('Liquidar en efectivo',{exact:true}).click();
      else{
        await page.getByRole('checkbox',{name:'Seleccionar PEN-000001',exact:true}).check();
        await page.getByRole('checkbox',{name:'Seleccionar PEN-000002',exact:true}).check();
        await page.getByRole('button',{name:mode==='cash'?'Efectivo':mode==='digital'?'Digital':'Combinado',exact:true}).click();
        if(mode==='mixed'){
          await page.getByRole('textbox',{name:/Monto digital/}).fill('10');
          await page.getByRole('button',{name:'Continuar al efectivo',exact:true}).click();
        }
      }
      let save;
      if(mode==='digital')save=page.getByRole('button',{name:'Liquidar',exact:true});
      else{
        await page.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]').fill(mode==='cash'?'2':'1');
        save=page.getByRole('button',{name:'Marcar como pagado',exact:true});
      }
      await save.evaluate(button=>{button.click();button.click();});
      await page.getByText(/RED-CON-002/).last().waitFor();
      assert.equal(attempts.length,1,`${mode}: synchronous double click sends once`);
      assert.match(attempts[0].requestId,/^[a-f0-9-]{36}$/);
      if(mode==='cash'){
        const input=page.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]');
        await input.fill('3');await save.click();
        await page.getByText('La referencia ya fue aplicada con otros datos.',{exact:true}).last().waitFor();
        assert.equal(attempts.at(-1).requestId,attempts[0].requestId,'Changing uncertain payload cannot bypass conflict with a fresh reference');
        await input.fill('2');
      }
      const beforeRead=pendingReads;
      await save.click();
      await page.waitForFunction(()=>!document.querySelector('.transaction-modal-panel,.pending-batch-dialog'));
      assert.deepEqual(attempts.at(-1),attempts[0],`${mode}: manual retry preserves request and payload`);
      if(mode!=='transaction'){
        await page.locator('.pending-table tbody tr').first().getByText('PAGADO',{exact:true}).waitFor();
        assert.ok(pendingReads>beforeRead,'Confirmed payment reloads authoritative pending rows');
      }
      assert.equal(await page.getByText(/RED-CON-002/).count(),0,'Confirmed retry clears the old uncertain-result warning');
      assert.deepEqual(errors,[]);
      await page.screenshot({path:path.resolve(__dirname,`../../tmp/payment-security-${mode}.png`),fullPage:true});
      await context.close();console.log(`${mode}: double-click, uncertain result and manual replay verified`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
