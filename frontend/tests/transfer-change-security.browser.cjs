// All API traffic is intercepted: no real accounts or financial operations.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const id='11111111-1111-4111-8111-111111111111',shift='22222222-2222-4222-8222-222222222222',account='33333333-3333-4333-8333-333333333333';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try{
    for(const scenario of ['edit-cash','edit-digital','edit-stale','void-retry','void-stale'].filter(name=>!process.env.TEMO_TRANSFER_CASE||process.env.TEMO_TRANSFER_CASE===name)){
      const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
      const user={id,fullName:'ADMIN QA',roleCode:'JEFA',roleName:'Administrador',permissions:['VER_TRANSFERS']};
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-transfer-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      let applied=false;const attempts=[],errors=[],digital=scenario==='edit-digital',voiding=scenario.startsWith('void');
      const row=()=>({database_id:id,id:'TRF-000001',id_turno:shift,edit_version:applied?'13':'12',fecha_transferencia:new Date().toISOString(),tipo:digital?'CUENTA_BANCARIA':'EFECTIVO',direccion:'SALE',moneda:'NIO',monto:applied?'200':'100',descripcion:'QA original',estado:applied&&voiding?'INACTIVO':'ACTIVO',id_cuenta:digital?account:null,cuenta:digital?'BAC NIO':null,entidad:'BAC',cajero:'CAJERA QA',sucursal:'SUCURSAL QA',caja:'Caja QA',cashLines:digital?[]:[{denomination:100,piles25:0,loose:applied?2:1}]});
      await context.route('**/api/**',async route=>{
        const request=route.request(),url=new URL(request.url()),p=url.pathname.replace(/^.*\/api/,'');let body=[];
        if(request.method()!=='GET'&&(p===`/transfers/${id}`||p.endsWith('/void'))){
          attempts.push(request.postDataJSON());
          if(scenario.endsWith('stale')){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'TRF-VER-409',message:'La transferencia cambio. Revise los datos actuales.'})});return;}
          if(attempts.length===1){await route.abort('connectionclosed');return;}
          if(JSON.stringify(attempts.at(-1))!==JSON.stringify(attempts[0])){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Esta solicitud ya fue aplicada con otros datos.'})});return;}
          applied=true;body=voiding?{ok:true}:row();
        }else if(p==='/auth/me')body={user};
        else if(p==='/shifts/access')body={active:null,prepared:null};
        else if(p==='/transfers')body=[row()];
        else if(p===`/transfers/${id}`)body=row();
        else if(p==='/transfers/context')body={shifts:[{id:shift,branch_id:shift,code:'TUR-000001',cashier:'CAJERA QA',branch:'SUCURSAL QA'}],accounts:[{id:account,alias:'BAC NIO',entity:'BAC',currency:'NIO',branch_id:shift}]};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:3188/#/transferencias');
      await page.getByText('Mostrar inactivos',{exact:true}).click();
      const record=page.locator('.transfer-table tbody tr').filter({hasText:'TRF-000001'});
      await record.getByTitle(voiding?'Anular':'Editar',{exact:true}).click();
      const modal=page.locator(voiding?'.transfer-cancellation-modal':'.transfer-modal');
      await modal.waitFor();
      const field=voiding?modal.getByLabel('Motivo de anulacion',{exact:true}):modal.getByLabel('Descripcion',{exact:true});
      await field.fill('QA change');
      const save=modal.getByRole('button',{name:voiding?'Anular transferencia':'Guardar',exact:true});
      await save.evaluate(button=>{button.click();button.click();});
      await modal.getByRole('alert').waitFor();
      assert.equal(attempts.length,1,'Double-click sends only one write');
      assert.equal(attempts[0].expectedVersion,'12');assert.match(attempts[0].requestId,/^[a-f0-9-]{36}$/);
      assert.equal(await modal.locator(voiding?'textarea':'input').filter({visible:true}).count()>0,true,'Draft fields remain mounted');
      assert.equal(await field.inputValue(),'QA change','Unconfirmed or stale save preserves user input');
      if(scenario.endsWith('stale')){
        assert.match(await modal.getByRole('alert').textContent(),/TRF-VER-409/);
        assert.equal(await modal.count(),1,'Stale edit never silently closes or refreshes the draft');
      }else{
        assert.match(await modal.getByRole('alert').textContent(),/RED-CON-002/);
        await field.fill('Changed after lost reply');await save.click();
        await modal.getByText('Esta solicitud ya fue aplicada con otros datos.',{exact:false}).waitFor();
        assert.equal(attempts.at(-1).requestId,attempts[0].requestId);
        await field.fill('QA change');await save.click();await modal.waitFor({state:'hidden'});
        assert.deepEqual(attempts.at(-1),attempts[0]);
        assert.ok((await record.innerText()).includes('200.00'),'List reloads current state rather than displaying a receipt as current data');
        if(voiding)assert.ok((await record.getAttribute('class')).includes('inactive-row'));
      }
      if(scenario==='void-stale')for(const [width,height]of [[1366,768],[1920,1080],[390,844]]){
        await page.setViewportSize({width,height});
        assert.ok(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Cancellation form has no horizontal overflow');
        await page.screenshot({path:path.resolve(__dirname,`../../tmp/transfer-cancellation-${width}.png`),fullPage:true});
      }
      assert.deepEqual(errors,[]);await context.close();console.log(`${scenario}: version, confirmation, draft and retry protections passed`);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
