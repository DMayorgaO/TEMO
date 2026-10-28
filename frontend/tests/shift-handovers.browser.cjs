const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const url='http://127.0.0.1:3188';
const senderId='11111111-1111-4111-8111-111111111111',receiverId='22222222-2222-4222-8222-222222222222';
const shiftId='33333333-3333-4333-8333-333333333333';
const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Managua'});
const counts={NIO:[1000,500,200,100,50,20,10,5,1,.5,.25].map(denomination=>({denomination,piles25:0,loose:denomination===100?10:0})),USD:[100,50,20,10,5,1].map(denomination=>({denomination,piles25:0,loose:0}))};
const snapshot={counts,totals:{NIO:1000,USD:0},hasDifferences:false,cashDifference:0,pendingCashDifference:0,changeNio:'0',
  summary:{expectedGeneralRate:36.4,expectedGeneral:{NIO:1000,USD:1000/36.4}},dollarPurchases:{usd:10,differenceNio:6},accountDifferences:[],
  identity:{shiftCode:'TUR-000085',branch:'SUCURSAL QA',register:'Caja QA',sender:'SALIENTE QA'},
  balances:[{account_id:'bac-nio',account:'BAC NIO',currency:'NIO',entity:'BAC',system:'12345.67',calculated:'12345.67',system_income:null,system_expense:null}]};
const source={database_id:shiftId,id:'TUR-000085',estado:'ABIERTO',id_sucursal:shiftId,sucursal:'SUCURSAL QA',caja:'Caja QA',cajero:'SALIENTE QA',fecha_apertura:`${day}T14:00:00Z`,efectivo_inicial_nio:'1000',efectivo_inicial_usd:'0',cambio_nio:'0',solicitud_estado:null,
  cashCounts:{ACTUAL:{NIO:{total:1000,lines:counts.NIO},USD:{total:0,lines:counts.USD}}},expectedCash:{NIO:1000,USD:0},expectedGeneral:{NIO:1000,USD:1000/36.4},expectedGeneralRate:36.4,pendingCash:{NIO:0,USD:0},
  balances:snapshot.balances.map(row=>({...row,initial:'12345.67',income:'0',expense:'0',calculated:'12345.67',difference:'0'})),availableAccounts:[],availableMovements:[]};
(async()=>{
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  let proposal=null,complete=false,stale=false,available=true,seq=0,reviewRequest=null;const errors=[],cashWrites=[];
  try{
    async function session(id){
      const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
      const user={id,fullName:id===senderId?'SALIENTE QA':'RECEPTOR QA',roleCode:'CAJERO',roleName:'Cajero',permissions:['VER_CASH_COUNT','VER_TRANSACTIONS']};
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-not-a-real-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      await context.route('**/api/**',async route=>{
        const r=route.request(),p=new URL(r.url()).pathname.replace(/^.*\/api/,'');let body=[];
        const active=id===senderId?!complete:complete;
        if(p==='/auth/me')body={user};
        else if(p==='/shifts/access')body={active:active?source:null,prepared:null};
        else if(p==='/shifts/notifications')body=[];
        else if(p==='/shifts/handovers')body=proposal?[proposal]:[];
        else if(p.endsWith('/handover-preview'))body={snapshot,version:'a'.repeat(64),requestId:'44444444-4444-4444-8444-444444444444'};
        else if(p.endsWith('/handover-candidates'))body=available?[{id:receiverId,nombre:'RECEPTOR QA'}]:[];
        else if(p.endsWith('/cash-count')&&r.method()==='PUT'){const data=r.postDataJSON();cashWrites.push(data);source.cambio_nio=String(data.changeNio);body=source;}
        else if(p.endsWith('/handover-difference')){reviewRequest=r.postDataJSON();source.cambio_nio='100';snapshot.changeNio='100';snapshot.pendingCashDifference=0;body={snapshot,version:'b'.repeat(64),requestId:'44444444-4444-4444-8444-444444444444'};}
        else if(p===`/shifts/${shiftId}/handovers`){proposal={id_traspaso:'handover-'+(++seq),id_emisor:senderId,id_receptor:receiverId,estado:'PENDIENTE',emisor:'SALIENTE QA',receptor:'RECEPTOR QA',turno_origen:source.id,sucursal:source.sucursal,caja:source.caja,fecha_limite:new Date(Date.now()+900000).toISOString(),resumen:snapshot,observaciones:r.postDataJSON().observations,modo:r.postDataJSON().mode};body=proposal;}
        else if(p.endsWith('/accept')){
          if(stale){await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Los datos cambiaron. Envie un resumen nuevo.'})});return;}
          complete=true;proposal=null;body={estado:'ACEPTADO'};
        }else if(p.endsWith('/reject')||p.endsWith('/cancel')){proposal=null;body={success:true};}
        else if(p==='/shifts/current'||p.startsWith('/shifts/'+shiftId))body=active?source:null;
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/#/arqueo');return page;
    }
    const sender=await session(senderId),receiver=await session(receiverId);
    snapshot.hasDifferences=true;snapshot.cashDifference=100;snapshot.pendingCashDifference=100;snapshot.summary.expectedGeneral.NIO=900;
    await sender.getByRole('button',{name:'Traspaso',exact:true}).click();
    await sender.getByText('Sobrante de efectivo: C$ 100.00.',{exact:true}).waitFor();
    assert.equal(reviewRequest,null,'Preview does not silently send administrative review');
    assert.equal(await sender.getByText('Efectivo contado (equiv. NIO)',{exact:true}).count(),0);
    await sender.getByLabel('Cajero receptor').selectOption(receiverId);
    assert.equal(await sender.getByRole('button',{name:'Traspasar y cerrar',exact:true}).isEnabled(),true);
    await sender.getByRole('dialog').getByRole('button',{name:'Registrar diferencia',exact:true}).click();
    assert.equal(reviewRequest.expectedVersion,'a'.repeat(64));
    await sender.getByRole('dialog').getByRole('button',{name:'Registrar diferencia',exact:true}).waitFor();
    assert.equal(await sender.getByRole('dialog').getByRole('button',{name:'Registrar diferencia',exact:true}).isEnabled(),false);
    const writesAfterRegister=cashWrites.length;
    await sender.waitForTimeout(3800);
    assert.equal(cashWrites.length,writesAfterRegister,'Polling does not autosave stale cash while handover is open');
    assert.equal(source.cambio_nio,'100','Registered difference is not overwritten by the previous draft');
    assert.equal(await sender.locator('[data-general-cash-change]').inputValue(),'100.00');
    await sender.getByLabel('Observaciones',{exact:true}).fill('Revisar sobrante de prueba');
    await sender.getByRole('button',{name:'Traspasar en revisión',exact:true}).click();
    await sender.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(proposal.observaciones,'Revisar sobrante de prueba');assert.equal(proposal.modo,'EN_REVISION');
    await receiver.reload();await receiver.getByRole('button',{name:'Revisar traspaso',exact:true}).click();
    await receiver.getByText(/El turno anterior quedará en revisión/).waitFor();
    assert.ok(await receiver.getByRole('dialog').getByText('---',{exact:true}).count());
    assert.equal(await receiver.getByRole('dialog').getByText('Sin diferencia',{exact:true}).count(),0);
    assert.equal(await receiver.locator('.handover-cash-card--nio > header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(37, 99, 166)');
    assert.notEqual(await receiver.locator('.handover-cash-card--usd > header').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
    await receiver.getByRole('button',{name:'Rechazar',exact:true}).click();
    snapshot.hasDifferences=false;snapshot.cashDifference=0;snapshot.pendingCashDifference=0;snapshot.summary.expectedGeneral.NIO=1000;
    const notes='Entrega verificada <b>sin HTML</b>';
    async function send(){await sender.reload();await sender.getByRole('button',{name:'Traspaso',exact:true}).click();await sender.getByLabel('Cajero receptor').selectOption(receiverId);await sender.getByLabel('Observaciones',{exact:true}).fill(notes);await sender.getByRole('button',{name:'Traspasar y cerrar',exact:true}).click();await sender.getByRole('dialog').waitFor({state:'hidden'});assert.ok(proposal);}
    await send();await receiver.reload();
    await receiver.getByRole('button',{name:'Revisar traspaso',exact:true}).click();
    const dialog=receiver.getByRole('dialog',{name:'Traspaso de turno'});
    await dialog.getByText('SALIENTE QA → RECEPTOR QA',{exact:true}).waitFor();
    await dialog.getByText(notes,{exact:true}).waitFor();
    assert.equal(await dialog.locator('.handover-observations b').count(),0);
    await dialog.getByText('Diferencia acumulada por compra de dólares',{exact:true}).waitFor();
    for(const [width,height]of[[1366,768],[1920,1080],[390,844]]){
      await receiver.setViewportSize({width,height});
      const bounds=await dialog.boundingBox();assert.ok(bounds.width<=width&&bounds.height<=height);
      assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),'No horizontal scroll inside handover summary');
      assert.ok(await receiver.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await receiver.screenshot({path:path.resolve(__dirname,`../../tmp/handover-review-${width}x${height}.png`),fullPage:true,animations:'disabled'});
    }
    await receiver.getByRole('button',{name:'Rechazar',exact:true}).click();assert.equal(complete,false);
    await send();await sender.getByRole('button',{name:'Traspaso pendiente',exact:true}).click();await sender.getByRole('button',{name:'Cancelar traspaso',exact:true}).click();assert.equal(proposal,null);
    await send();await receiver.reload();await receiver.getByRole('button',{name:'Revisar traspaso',exact:true}).click();
    stale=true;await receiver.getByRole('button',{name:'Aceptar traspaso',exact:true}).click();await receiver.getByRole('alert').filter({hasText:'Los datos cambiaron'}).waitFor();assert.equal(complete,false);
    stale=false;await receiver.getByRole('button',{name:'Aceptar traspaso',exact:true}).click();await receiver.getByRole('dialog').waitFor({state:'hidden'});assert.equal(complete,true);
    assert.deepEqual(errors,[]);console.log('Handover browser flow passed: two sessions, reject, cancel, stale summary, accept, desktop/mobile framing');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
