const {transactionTableFixture}=require('./transaction-table-fixture.cjs');
// Independent synthetic sessions and a shared intercepted backend; never sends real financial writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const userId='11111111-1111-4111-8111-111111111111',shiftId='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333',groupId='44444444-4444-4444-8444-444444444444';
const initialVersion=9007199254740993n;
const model={version:initialVersion,amount:10,annulled:false,effects:0,receipts:new Map()};
const counts={NIO:{total:1000,lines:[{denomination:10,piles25:0,loose:100}]},USD:{total:0,lines:[]}};
const shift={database_id:shiftId,id:'TUR-000100',estado:'ABIERTO',sucursal:'SUCURSAL QA',caja:'Caja QA',cajero:'CAJERO QA',cambio_nio:'0',cashCounts:{ACTUAL:counts},expectedCash:{NIO:1000,USD:0},balances:[{account_id:shiftId,account:"BAC NIO",system:"42232.42",currency:"NIO"}],
  availableAccounts:[{account_id:shiftId,account:'BAC NIO',entity:'BAC',currency:'NIO'}],availableMovements:[{entity:'BAC',code:'DC',name:'Deposito',direction:'Ingreso',accountDirection:'Salida',affectsAccount:true,currencies:['NIO']}]};
const snapshot=()=>({version:String(model.version),amount:model.amount,annulled:model.annulled});
const transaction=(s,missing=false)=>({edit_version:missing?undefined:s.version,database_id:id,id:'TRA-000100-01',id_grupo_transacciones:groupId,orden_grupo:1,shift_id:shiftId,fecha_transaccion:new Date().toISOString(),monto:String(s.amount),moneda:'NIO',direccion:'ENTRA',estado:s.annulled?'ANULADA':'REGISTRADA',entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:'CAJERO QA',sucursal:shift.sucursal,descripcion:'Fixture',liquidacion:{}});
const detail=(s,missing=false)=>({editVersion:missing?undefined:s.version,transaction:transaction(s,missing),rates:{buy:36.4,sell:37},settlement:{independent:true,primaryDirection:'ENTRA',primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:{NIO:[{denomination:10,piles25:0,loose:s.amount/10}],USD:[]},changeCounts:{NIO:[],USD:[]}}});
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});const contexts=[];
  try{
    async function client(label,{missing=false,freezeList=false,loseResponse=false}={}){
      const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});contexts.push(context);
      const user={id:userId,fullName:'CAJERO QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_TRANSACTIONS','VER_CASH_COUNT']};
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-local-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      const writes=[],errors=[],frozen=snapshot();let freshList=false,lost=false;
      await context.route('**/api/**',async route=>{
        const request=route.request(),p=new URL(request.url()).pathname.replace(/^.*\/api/,'');let body=[];
        if(request.method()!=='GET'&&(p.endsWith('/group')||p.endsWith('/void'))){
          const input=request.postDataJSON();writes.push({path:p,body:input});
          const receipt=model.receipts.get(input.requestId);
          if(receipt){
            assert.equal(JSON.stringify(receipt.input),JSON.stringify(input),'A replay must retain both version and payload');body=receipt.result;
          }else if(input.expectedVersion!==String(model.version)){
            if(p.endsWith('/void'))freshList=true;
            await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'TRA-VER-409',message:'La operacion cambio. No se guardo ningun cambio. Conserve su borrador y vuelva a abrir el registro.'})});return;
          }else{
            model.effects++;model.version++;
            if(p.endsWith('/void'))model.annulled=true;else model.amount=input.updates[0].data.amount;
            body={updated:1,voided:0,id,status:'ANULADA'};model.receipts.set(input.requestId,{input,result:body});
            if(loseResponse&&!lost){lost=true;await route.abort('connectionclosed');return;}
          }
        }else if(p==='/auth/me')body={user};
        else if(p==='/shifts/access')body={active:shift,prepared:null};
        else if(p==='/shifts/current'||p===`/shifts/${shiftId}`)body=shift;
        else if(p==='/shifts')body=[shift];
        else if(p==='/transactions/table')body=[transaction(freezeList&&!freshList?frozen:snapshot(),missing)];
        else if(p.endsWith('/group-detail')){const s=snapshot();body={editVersion:missing?undefined:s.version,details:[detail(s,missing)],compensations:[]};}
        else if(p.endsWith('/detail'))body=detail(snapshot(),missing);
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(transactionTableFixture(route.request().url(),body))});
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:3188/#/transacciones');await page.getByText('Mostrar inactivos',{exact:true}).click();
      const row=page.locator('tbody tr').filter({hasText:'TRA-000100-01'}),modal=page.locator('.transaction-modal-panel');
      return {page,row,modal,writes,errors,label,context,
        edit:async amount=>{await row.getByTitle('Editar',{exact:true}).click();await modal.locator('[data-transaction-amount]').fill(String(amount));await modal.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]').fill(String(amount/10));},
        save:()=>modal.getByRole('button',{name:'Guardar',exact:true}).click(),
        annul:async()=>{await row.getByTitle('Anular',{exact:true}).click();const confirm=page.locator('.system-dialog-backdrop');await confirm.getByRole('button',{name:'Anular',exact:true}).click();}};
    }

    const a=await client('balance');
    await a.edit(45000);
    const amount=a.modal.locator('[data-transaction-amount]');
    await a.page.waitForFunction(()=>document.querySelector('[data-transaction-amount]').classList.contains('transaction-amount--insufficient'));
    await a.page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-transaction-amount]')).backgroundColor==='rgb(255, 240, 237)');
    assert.equal(await a.modal.locator('.transaction-balance-header').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(233, 246, 239)');
    const cash=a.modal.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]');
    await cash.fill('0');
    await a.page.waitForFunction(()=>getComputedStyle(document.querySelector('.transaction-balance-header')).backgroundColor==='rgb(251, 224, 220)');
    await a.page.screenshot({path:'tmp/transaction-header-receive-1366.png',fullPage:true});
    await cash.fill('4501');
    await a.page.waitForFunction(()=>getComputedStyle(document.querySelector('.transaction-balance-header')).backgroundColor==='rgb(255, 244, 199)');
    await cash.fill('4500');
    await a.page.screenshot({path:'tmp/transaction-balance-header-1366.png',fullPage:true});
    shift.balances[0].system='45000';
    await a.page.waitForFunction(()=>!document.querySelector('[data-transaction-amount]').classList.contains('transaction-amount--insufficient'),null,{timeout:15000});
    assert.equal(await amount.inputValue(),'45,000.00');
    shift.balances[0].system='46000';
    await a.modal.getByText('Saldo digital: C$ 46,000.00',{exact:true}).waitFor({timeout:15000});
    assert.equal(await amount.evaluate(e=>e.classList.contains('transaction-amount--insufficient')),false);
    shift.balances[0].system='44000';
    await a.page.waitForFunction(()=>document.querySelector('[data-transaction-amount]').classList.contains('transaction-amount--insufficient'),null,{timeout:15000});
    await a.page.setViewportSize({width:1920,height:1080});
    await a.page.screenshot({path:'tmp/transaction-balance-header-1920.png',fullPage:true});
    assert.deepEqual(a.errors,[]);assert.equal(a.writes.length,0);
    console.log('Live balance: insufficient, equal, increased and decreased; draft preserved; full header at both desktop sizes.');
  }finally{for(const c of contexts)await c.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
