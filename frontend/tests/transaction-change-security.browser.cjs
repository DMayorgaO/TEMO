// No real accounts or writes: all API requests are intercepted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const userId='11111111-1111-4111-8111-111111111111',shiftId='22222222-2222-4222-8222-222222222222';
const groupId='33333333-3333-4333-8333-333333333333',ids=['44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
const counts={NIO:{total:1000,lines:[{denomination:10,piles25:0,loose:100}]},USD:{total:0,lines:[]}};
const shift={database_id:shiftId,id:'TUR-000100',estado:'ABIERTO',sucursal:'SUCURSAL QA',caja:'Caja QA',cajero:'CAJERO QA',cambio_nio:'0',cashCounts:{ACTUAL:counts},expectedCash:{NIO:1000,USD:0},balances:[],
  availableAccounts:[{account_id:shiftId,account:'BAC NIO',entity:'BAC',currency:'NIO'}],availableMovements:[{entity:'BAC',code:'DC',name:'Deposito',direction:'Ingreso',accountDirection:'Salida',affectsAccount:true,currencies:['NIO']}]};
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try{
    for(const scenario of ['edit-one','edit-many','void-one','void-many','void-historical','void-later']){
      const size=scenario.endsWith('many')?2:1,editing=scenario.startsWith('edit');
      const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
      const historical=scenario==='void-historical'||scenario==='void-later';
      const user={id:userId,fullName:'CAJERO QA',roleCode:historical?'JEFA':'CAJERO',roleName:'Cajero',permissions:['VER_TRANSACTIONS','VER_CASH_COUNT']};
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-local-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      const attempts=[],errors=[];let confirmed=false;
      const transaction=index=>({edit_version:confirmed?'2':'1',database_id:ids[index],id:`TRA-000100-0${index+1}`,id_grupo_transacciones:groupId,orden_grupo:index+1,shift_id:shiftId,fecha_transaccion:new Date().toISOString(),monto:confirmed&&editing?'30':'10',moneda:'NIO',direccion:'ENTRA',estado:confirmed&&!editing&&scenario!=='void-later'?'ANULADA':'REGISTRADA',entidad:'BAC',codigo_movimiento:'DC',movimiento:'Deposito',cajero:'CAJERO QA',sucursal:shift.sucursal,descripcion:'Fixture',liquidacion:{}});
      const detail=index=>({editVersion:confirmed?'2':'1',transaction:transaction(index),rates:{buy:36.4,sell:37},settlement:{independent:true,primaryDirection:'ENTRA',primaryRateKind:'COMPRA',changeRateKind:'COMPRA',expectedChange:{NIO:0,USD:0},primaryCounts:{NIO:[{denomination:10,piles25:0,loose:1}],USD:[]},changeCounts:{NIO:[],USD:[]}}});
      await context.route('**/api/**',async route=>{
        const request=route.request(),p=new URL(request.url()).pathname.replace(/^.*\/api/,'');let body=[];
        if(request.method()!=='GET'&&(p.endsWith('/group')||p.endsWith('/void'))){
          attempts.push(request.postDataJSON());
          if(attempts.length===1){await route.abort('connectionclosed');return;}
          if(JSON.stringify(attempts.at(-1))!==JSON.stringify(attempts[0])){
            await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'La solicitud ya fue aplicada con otros datos.'})});return;
          }
          confirmed=true;body={updated:size,voided:editing?0:size,id:ids[0],status:'ANULADA',historical};
        }else if(p==='/auth/me')body={user};
        else if(p==='/shifts/access')body={active:shift,prepared:null};
        else if(p==='/shifts/current'||p===`/shifts/${shiftId}`)body=shift;
        else if(p==='/shifts')body=[shift];
        else if(p==='/transactions')body=Array.from({length:size},(_,index)=>transaction(index));
        else if(p.endsWith('/group-detail'))body={editVersion:confirmed?'2':'1',details:Array.from({length:size},(_,index)=>detail(index)),compensations:[]};
        else if(p.endsWith('/detail'))body=detail(0);
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:3188/#/transacciones');
      await page.getByText('Mostrar inactivos',{exact:true}).click();
      const row=page.locator('tbody tr').filter({hasText:'TRA-000100-01'});
      const modal=page.locator('.transaction-modal-panel');
      if(editing||size>1)await row.getByTitle('Editar',{exact:true}).click();
      if(scenario==='edit-one'){
        const status=modal.locator('.modal-top .transaction-group-change-summary');
        const received=modal.locator('[data-cash-scope="received"][data-cash-currency="NIO"][data-cash-row="6"][data-cash-column="1"]');
        await status.waitFor();
        assert.equal(await status.count(),1,'Customer balance appears once, in the pinned header');
        for(const [quantity,tone,label,color]of [
          ['0','receive','Pendiente por recibir del cliente','rgb(255, 240, 237)'],
          ['2','deliver','Pendiente por entregar al cliente','rgb(255, 244, 199)'],
          ['1','settled','Cuenta del cliente equilibrada','rgb(233, 246, 239)'],
        ]){
          await received.fill(quantity);await received.blur();
          await modal.getByRole('status',{name:label,exact:true}).waitFor();
          assert.ok((await status.getAttribute('class')).endsWith(`--${tone}`));
          assert.equal(await status.evaluate(e=>getComputedStyle(e).backgroundColor),color,'Existing balance-state colors are preserved');
          assert.equal(await status.locator('strong').count(),2,'NIO and USD equivalents remain visible');
        }
      }
      if(scenario==='edit-many'){
        assert.ok((await modal.locator('.transaction-tab__amount').first().textContent()).includes('10.00'));
        assert.equal(await modal.locator('.transaction-tab__select small').first().textContent(),'BAC · DC');
        assert.equal(await modal.locator('.transaction-tab__select').first().getAttribute('title'),'Deposito');
        for(const [width,height]of [[1366,768],[1920,1080],[390,844],[844,390]]){
          await page.setViewportSize({width,height});
          assert.ok(await modal.locator('.transaction-tab').first().evaluate(e=>e.getBoundingClientRect().height<=48),'Bank, code and amount keep tabs compact');
          await modal.evaluate(e=>{e.scrollTop=0;});
          const before=await modal.locator('.modal-top').boundingBox();
          await modal.evaluate(e=>{e.scrollTop=e.scrollHeight;});
          await page.waitForTimeout(80);
          const bounds=await modal.boundingBox(),top=await modal.locator('.modal-top').boundingBox(),bottom=await modal.locator('.modal-actions').boundingBox();
          const status=modal.locator('.transaction-group-change-summary'),statusBounds=await status.boundingBox(),tabs=await modal.locator('.transaction-tabs').boundingBox();
          assert.ok(statusBounds.y>=top.y&&statusBounds.y+statusBounds.height<=tabs.y+1,'Customer balance stays above tabs inside the pinned header');
          assert.ok(await status.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Balance label and both currencies fit without overflow');
          assert.ok(await modal.locator('.modal-header').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Tools and balance fit the header');
          if(width>=900){
            const tool=await modal.getByRole('button',{name:'Calculadora',exact:true}).boundingBox();
            assert.ok(Math.abs(statusBounds.height-tool.height)<1,'Balance frame matches the adjacent tool button height');
          }
          assert.ok(Math.abs(top.y-before.y)<2,`Header and tools stay pinned at ${width}`);
          assert.ok(bottom.y+bottom.height<=bounds.y+bounds.height+1,`Footer remains inside viewport at ${width}`);
          assert.ok(bottom.y>top.y+top.height+70,`Central content retains usable space at ${width}`);
          assert.ok(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'No horizontal overflow in form');
          await page.screenshot({path:path.resolve(__dirname,`../../tmp/pinned-transaction-${width}.png`),fullPage:true});
        }
        await page.setViewportSize({width:1366,height:768});await modal.evaluate(e=>{e.scrollTop=0;});
      }
      const save=editing?modal.getByRole('button',{name:size>1?`Guardar ${size} transacciones`:'Guardar',exact:true}):size>1?modal.getByRole('button',{name:`Anular ${size} transacciones`,exact:true}):row.getByTitle('Anular',{exact:true});
      async function send(){
        await save.evaluate(button=>{button.click();button.click();});
        if(!editing){
          const confirm=page.locator('.system-dialog-backdrop');await confirm.waitFor();
          assert.equal(await confirm.count(),1,'Double-click must not open competing confirmations');
          await confirm.getByRole('button',{name:size>1?'Anular grupo':'Anular',exact:true}).click();
        }
      }
      if(!editing){
        await save.click();
        await page.locator('.system-dialog-backdrop').getByRole('button',{name:'Cancelar',exact:true}).click();
        await page.waitForFunction(()=>!document.querySelector('.system-dialog-backdrop'));
        assert.equal(attempts.length,0,'Cancelling confirmation never submits an annulment');
      }
      await send();await page.getByText(/RED-CON-002/).last().waitFor();
      assert.equal(attempts.length,1,`${scenario}: double-click writes once`);assert.match(attempts[0].requestId,/^[a-f0-9-]{36}$/);
      if(editing){
        const description=modal.locator('.transaction-form-description textarea');
        await description.fill('Changed after uncertain response');await save.click();
        await page.getByText('La solicitud ya fue aplicada con otros datos.',{exact:true}).last().waitFor();
        assert.equal(attempts.at(-1).requestId,attempts[0].requestId);
        await description.fill('Fixture');
      }
      await page.screenshot({path:path.resolve(__dirname,`../../tmp/transaction-change-${scenario}.png`),fullPage:true});
      await send();
      if(editing||size>1)await modal.waitFor({state:'hidden'});
      else await page.getByRole('heading',{name:scenario==='void-later'?'Resultado confirmado':'Transacción anulada',exact:true}).waitFor();
      assert.deepEqual(attempts.at(-1),attempts[0],`${scenario}: manual retry retains reference and payload`);
      if(editing){
        assert.ok((await row.innerText()).includes('30.00'),'Refresh shows current server data rather than an old receipt');
        await row.getByTitle('Editar',{exact:true}).click();
        await save.click();await page.getByText('La solicitud ya fue aplicada con otros datos.',{exact:true}).last().waitFor();
        assert.notEqual(attempts.at(-1).requestId,attempts[0].requestId,'New edit form receives a new reference');
      }else if(scenario==='void-later'){
        await page.getByText(/tiene cambios posteriores; revise su estado actual/).waitFor();
        assert.equal(await page.getByTitle('Transacción anulada',{exact:true}).count(),0);
      }else {
        assert.equal(await page.getByTitle('Transacción anulada',{exact:true}).count(),size);
        if(historical)await page.getByText(/El cierre y sus fondos se conservaron/).waitFor();
      }
      assert.deepEqual(errors,[]);await context.close();console.log(`${scenario}: guarded confirmation, lost response and safe retry passed`);
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
