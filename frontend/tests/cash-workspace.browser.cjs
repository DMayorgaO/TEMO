// Browser contract tests with intercepted APIs and synthetic sessions; never contacts real accounts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const baseUrl=process.env.TEMO_UI_TEST_URL || 'http://127.0.0.1:3188';
assert.ok(['127.0.0.1','localhost'].includes(new URL(baseUrl).hostname),'UI fixtures must run locally');
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Managua'});
const id='11111111-1111-4111-8111-111111111111';
const makeShift=(code=85,state='ABIERTO')=>({database_id:code===85?id:'22222222-2222-4222-8222-222222222222',id:`TUR-0000${code}`,estado:state,
  id_sucursal:id,sucursal:'MISCELANEA OLIVERA',caja:'Caja 1',cajero:code===85?'CAJERA DE PRUEBA':'OTRA CAJERA',fecha_apertura:`${today}T14:00:00Z`,
  efectivo_inicial_nio:'50500',efectivo_inicial_usd:'2451',cambio_nio:'372.60',solicitud_estado:null,
  cashCounts:{ACTUAL:{NIO:{total:81890,lines:[{denomination:1000,piles25:0,loose:16},{denomination:500,piles25:3,loose:6}]},USD:{total:1500,lines:[{denomination:100,piles25:0,loose:4}]}}},
  expectedCash:{NIO:136207.4,USD:0},expectedGeneral:{NIO:136207.4,USD:3741.96},expectedGeneralRate:36.4,pendingCash:{NIO:11252.25,USD:0},
  availableAccounts:[],availableMovements:[],dollarPurchases:{usd:235.13,differenceNio:141.078},
  balances:['NIO','USD'].flatMap(currency=>(currency==='NIO'?['BAC','BANPRO','LAFISE','PEX']:['BAC','BANPRO','LAFISE','PEX','TELEDOLAR']).map((entity,i)=>({account_id:`${currency}-${i}`,account:`${entity} ${currency}`,entity,currency,initial:'1000000',income:'0',expense:'0',calculated:'1000000',system:'1000000',system_income:entity==='TELEDOLAR'?'1000000':null,system_expense:entity==='TELEDOLAR'?'0':null,difference:'0'})))});
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try {
    for(const role of ['JEFA','CAJERO']){
      const context=await browser.newContext({viewport:{width:1366,height:768},timezoneId:'America/Managua'});
      const permissions=['CASH_COUNT','TRANSACTIONS','TRANSFERS','DOLLAR_PURCHASES','PENDING','DASHBOARD','SHIFTS'].map(s=>`VER_${s}`);
      const user={id,fullName:'USUARIO QA LOCAL',roleCode:role,roleName:role,permissions};
      let shift=makeShift();const closed=makeShift(80,'CERRADO');const writes=[];const errors=[];let failBalance=false,failCash=false,closeNotice=false,noticeTime=new Date().toISOString();
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','visual-fixture-not-a-real-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      await context.route('**/api/**',async route=>{
        const request=route.request(),url=new URL(request.url()),p=url.pathname.replace(/^.*\/api/,'');
        let body=[];
        if(request.method()!=='GET')writes.push({path:p,body:request.postDataJSON()});
        if(p==='/auth/me')body={user};
        else if(p==='/transfers/context')body={shifts:[],accounts:[]};
        else if(p==='/shifts/notifications')body=closeNotice?[{id:'55555555-5555-4555-8555-555555555555',kind:'CLOSE_REQUEST',shift_state:shift.estado,shift_id:id,shift_code:shift.id,cashier:shift.cajero,branch:shift.sucursal,register:shift.caja,created_at:noticeTime,observations:'Revision de prueba'},
          {id:'66666666-6666-4666-8666-666666666666',kind:'SHIFT_HANDOVER',shift_id:id,shift_code:shift.id,cashier:shift.cajero,branch:shift.sucursal,register:shift.caja,created_at:noticeTime,observations:'Texto legado',handover_sender:'Cajera saliente',handover_receiver:'Cajera entrante',handover_destination:'TUR-000086',handover_mode:'EN_REVISION'}]:[];
        else if(p==='/shifts/access')body={active:{database_id:id,estado:'ABIERTO',sucursal:shift.sucursal,caja:shift.caja},prepared:null};
        else if(p==='/shifts/dashboard')body={today,tableDay:url.searchParams.get('day')||today,from:today,to:today,counts:[],accounts:[],banks:[],balances:[],lafise:[],reconciliation:[]};
        else if(p==='/shifts')body=[shift,closed];
        else if(p==='/shifts/current'||p.startsWith('/shifts/'+id)){
          if(p.endsWith('/close-request'))shift={...shift,closure_requested:true,write_locked:true};
          if(p.endsWith('/cancel-close-request'))shift={...shift,closure_requested:false,write_locked:false,solicitud_estado:'CANCELADA'};
          if(p.endsWith('/account-balances')){
            if(failBalance){failBalance=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fallo de prueba al guardar saldo'})});return;}
            const input=request.postDataJSON().balances[0];shift={...shift,balances:shift.balances.map(row=>row.account===input.account?{...row,system:String(input.amount),system_income:input.income===undefined?row.system_income:String(input.income),system_expense:input.expense===undefined?row.system_expense:String(input.expense)}:row)};
          }
          if(p.endsWith('/cash-count')&&request.method()==='PUT'){
            if(failCash){failCash=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'No se guardo el arqueo de prueba'})});return;}
            shift={...shift,cambio_nio:String(request.postDataJSON().changeNio)};
          }
          body=shift;
        }else if(p.includes(closed.database_id))body=closed;
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
      page.on('requestfailed',r=>console.log('REQUEST FAILED',r.url(),r.failure()));
      page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text());});
      await page.goto(`${baseUrl}/#/arqueo`);
      await page.waitForTimeout(600);
      await page.locator('.cash-workspace-balances .consolidation-table').first().waitFor();
      assert.deepEqual((await page.locator('.cash-count-live-grid .transaction-cash-card--nio .transaction-cash-denomination').allTextContents()).slice(-3),['C$ 1.00','C$ 0.50','C$ 0.25']);
      assert.equal(await page.getByRole('button',{name:'Limpiar',exact:true}).count(),0,'Arqueo no permite reiniciar todo el conteo');
      await page.waitForTimeout(300);
      for(const [width,height] of [[1366,768],[1920,1080],[1280,720],[1366,650],[390,844]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(150);
        const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,panelBottom:document.querySelector('.cash-workspace').getBoundingClientRect().bottom,
          clipped:[...document.querySelectorAll('.cash-workspace .money-split,.cash-workspace .consolidation-input,.cash-workspace .transaction-cash-amount')].filter(e=>e.scrollWidth>e.clientWidth+2).length}));
        console.log(JSON.stringify({role,...metrics}));
        assert.ok(metrics.docWidth<=width,`Horizontal overflow at ${width}`);
        assert.equal(metrics.clipped,0);
        const appearance=await page.evaluate(()=>{
          const balances=document.querySelector('.cash-workspace-balances').getBoundingClientRect();
          const cash=document.querySelector('.cash-count-live-grid').getBoundingClientRect();
          const row=document.querySelector('.transaction-cash-table__row');
          return {gap:cash.top-balances.bottom,columns:getComputedStyle(row).gridTemplateColumns.split(' '),
            weights:[...document.querySelectorAll('.cash-workspace .consolidation-table td .money-split span,.cash-workspace .consolidation-input,.cash-workspace .transaction-cash-table__row input,.cash-workspace .transaction-cash-table__row .transaction-cash-amount')].map(e=>getComputedStyle(e).fontWeight)};
        });
        assert.ok(Math.abs(appearance.gap-30)<1,'Balances and cash count must be separated by 30px');
        assert.equal(appearance.columns[3],appearance.columns[4],'Denomination and amount use the same width');
        assert.ok(appearance.weights.every(weight=>weight==='700'),'Table values must use font-weight 700');
        if(width>=1280)assert.ok(metrics.docHeight<=height,`Vertical overflow at ${width}x${height}`);
        await page.screenshot({path:path.join(root,'tmp',`cash-unified-${role}-${width}x${height}.png`),fullPage:true});
      }
      await page.setViewportSize({width:1366,height:768});
      const baseline=structuredClone(shift);
      shift={...shift,balances:[...shift.balances,...['BANK A','BANK B'].map((entity,index)=>({...shift.balances[0],entity,account:`${entity} NIO`,account_id:`extra-${index}`})),{...shift.balances[4],entity:'BANK C',account:'BANK C USD',account_id:'extra-usd'}]};
      await page.reload();await page.locator('.cash-workspace-balances').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
      shift=baseline;await page.reload();await page.locator('.cash-workspace-balances').waitFor();
      assert.equal(await page.getByRole('button',{name:'Saldos',exact:true}).count(),0);
      assert.equal(await page.getByText('Diferencial por compras',{exact:true}).count(),0);
      if(role==='JEFA'){
        const input=page.getByRole('textbox',{name:'Saldo sistema BAC NIO',exact:true});
        const balanceWrites=()=>writes.filter(w=>w.path.endsWith('/account-balances'));
        await input.focus();await input.press('ControlOrMeta+A');
        const beforeTyping=balanceWrites().length;
        await input.pressSequentially('1234567.89',{delay:0});
        assert.equal(await input.inputValue(),'1234567.89');
        assert.equal(balanceWrites().length,beforeTyping,'Typing must not save or reformat the balance');
        await input.press('Enter');await page.waitForTimeout(150);
        assert.equal(balanceWrites().at(-1).body.balances[0].amount,1234567.89);
        assert.equal(await input.inputValue(),'1,234,567.89');
        await input.focus();await input.press('ControlOrMeta+A');await input.pressSequentially('12345');
        await input.press('ArrowLeft');await input.press('ArrowLeft');await input.pressSequentially('9');
        assert.equal(await input.inputValue(),'123945');
        await input.press('Backspace');assert.equal(await input.inputValue(),'12345');
        await input.blur();await page.waitForTimeout(150);
        await input.fill('999999.99');await input.blur();await page.waitForTimeout(200);
        assert.equal(writes.filter(w=>w.path.endsWith('/account-balances')).at(-1).body.balances[0].account,'BAC NIO');
        await page.locator('input[aria-label="Saldo sistema Envíos TELEDOLAR USD"]').fill('100');
        await page.locator('input[aria-label="Saldo sistema Envíos TELEDOLAR USD"]').blur();await page.waitForTimeout(150);
        const td=writes.filter(w=>w.path.endsWith('/account-balances')).at(-1).body.balances[0];
        assert.equal(td.amount,999900);assert.equal(td.income,1000000);assert.equal(td.expense,100);
        failBalance=true;await input.fill('123.45');await input.blur();
        await page.getByRole('alert').filter({hasText:'Fallo de prueba'}).waitFor();
        assert.equal(await input.inputValue(),'123.45');
        await page.locator('.cash-history summary').click();
        await page.getByLabel('Arqueo histórico',{exact:true}).selectOption(closed.database_id);
        await page.getByText('Solo lectura',{exact:true}).waitFor();
        assert.equal(await page.getByRole('textbox',{name:'Saldo sistema BAC NIO',exact:true}).isEditable(),false);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));
        await page.locator('.cash-shift-selector select').selectOption(id);
        await page.waitForTimeout(100);
        assert.notEqual(await page.getByRole('textbox',{name:'Saldo sistema BAC NIO',exact:true}).inputValue(),'123.45');
        shift={...shift,balances:[...shift.balances,{...shift.balances[0],account_id:'other-bac',account:'BAC NIO SECOND',initial:'100',system:'100',calculated:'100'}]};
        await page.reload();await page.locator('.cash-workspace-balances').waitFor();
        const aggregate=page.getByRole('textbox',{name:'Saldo sistema BAC NIO',exact:true});
        await aggregate.fill('500000');await aggregate.blur();await page.waitForTimeout(150);
        assert.equal(writes.filter(w=>w.path.endsWith('/account-balances')).at(-1).body.balances[0].amount,499900);
        assert.equal(shift.balances.find(row=>row.account==='BAC NIO SECOND').system,'100');
      }
      if(role==='CAJERO'){
        shift={...shift,estado:'EN_REVISION',solicitud_estado:'PENDIENTE'};
        await page.reload();await page.locator('.cash-workspace-balances').waitFor();
        const close=page.getByRole('button',{name:'Solicitar cierre',exact:true});
        assert.equal(await close.isEnabled(),true);
        const before=writes.length;
        await close.click();
        await page.getByRole('dialog').filter({hasText:'El turno seguira en revision'}).waitFor();
        await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click();
        await page.getByText('Correcciones listas. Solicitud enviada al Administrador para revisar el cierre.',{exact:true}).waitFor();
        const save=writes.slice(before).findIndex(w=>w.path.endsWith('/cash-count'));
        const request=writes.slice(before).findIndex(w=>w.path.endsWith('/close-request'));
        assert.ok(save>=0&&request>save,'Save current cash before asking for closure');
        assert.equal(writes.slice(before).filter(w=>w.path.endsWith('/close-request')).length,1);
        assert.equal(shift.estado,'EN_REVISION');
        assert.equal(await close.isEnabled(),false);
        assert.equal(await page.getByRole('textbox',{name:'Saldo sistema BAC NIO',exact:true}).isEditable(),false);
        assert.equal(await page.getByRole('button',{name:'Agregar transaccion',exact:true}).isEnabled(),false);
        const cash=page.locator('input[data-cash-scope="general-cash-count"]').first();
        assert.equal(await cash.isEditable(),false);
        await page.screenshot({path:path.join(root,'tmp','review-request-close.png'),fullPage:true});
        await page.getByRole('button',{name:'Cancelar solicitud',exact:true}).click();
        await page.getByRole('button',{name:'Habilitar correcciones',exact:true}).click();
        await page.waitForFunction(()=>!document.querySelector('.cash-close-button')?.disabled);
        assert.equal(shift.estado,'EN_REVISION');
        assert.equal(await cash.isEditable(),true);
        assert.equal(await page.getByRole('textbox',{name:'Saldo sistema BAC NIO',exact:true}).isEditable(),true);
        failCash=true;
        const requests=writes.filter(w=>w.path.endsWith('/close-request')).length;
        await close.click();await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click();
        await page.getByText('No se guardo el arqueo de prueba',{exact:true}).waitFor();
        assert.equal(writes.filter(w=>w.path.endsWith('/close-request')).length,requests,'Failed cash save must not notify readiness');
        assert.equal(await close.isEnabled(),true);
      }
      await page.goto(`${baseUrl}/#/saldos`);await page.locator('.cash-workspace-balances').waitFor();
      if(role==='JEFA'){
        for(const hash of ['transferencias','compra-dolares','pendientes']){
          await page.goto(`${baseUrl}/#/${hash}`);
          const button=page.getByRole('button',{name:'Hoy',exact:true});await button.waitFor();await button.click();
          assert.equal(await button.getAttribute('aria-pressed'),'true');
          const activeColor=await button.evaluate(e=>getComputedStyle(e).backgroundColor);
          await page.locator('input[name="period-start-date"]').fill('2026-01-01');
          assert.equal(await button.getAttribute('aria-pressed'),'false');
          console.log(JSON.stringify({todayButton:hash,activeColor}));
        }
        await page.goto(`${baseUrl}/#/dashboard`);
        const button=page.getByRole('button',{name:'Hoy',exact:true});await button.waitFor();
        assert.equal(await button.getAttribute('aria-pressed'),'true');
        await page.getByLabel('Día de transacciones',{exact:true}).fill('2026-01-01');
        assert.equal(await button.getAttribute('aria-pressed'),'false');
        await button.click();
        await page.waitForFunction(()=>document.querySelector('.report-today-button')?.getAttribute('aria-pressed')==='true');
        assert.equal(await button.getAttribute('aria-pressed'),'true');
      }
      if(role==='JEFA'){
        closeNotice=true;await page.reload();
        await page.getByText('Saliente',{exact:true}).waitFor();
        await page.getByText('Entrante',{exact:true}).waitFor();
        const reviewButton=page.getByRole('button',{name:'Revisar cierre',exact:true});
        const style=await reviewButton.evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,height:e.getBoundingClientRect().height}));
        assert.equal(style.background,'rgb(15, 118, 110)');assert.equal(style.color,'rgb(255, 255, 255)');assert.ok(style.height>=40);
        for(const [width,height]of [[1366,768],[1920,1080],[390,844]]){
          await page.setViewportSize({width,height});
          assert.ok(await page.locator('.notification-summary').evaluate(e=>e.scrollWidth<=e.clientWidth));
          await page.screenshot({path:path.join(root,'tmp',`handover-notification-${width}.png`),fullPage:true,animations:'disabled'});
        }
        await page.setViewportSize({width:1366,height:768});
        await page.getByRole('button',{name:'Aceptar resumen',exact:true}).click();
        await page.evaluate(()=>window.dispatchEvent(new Event('temo:operational-data-changed')));
        await page.waitForTimeout(350);
        assert.equal(await page.getByRole('button',{name:'Revisar cierre',exact:true}).count(),0,'Dismissed request stays hidden until renewed');
        noticeTime=new Date(Date.now()+1000).toISOString();
        shift={...shift,estado:'EN_REVISION',closure_version:'2026-10-27 14:00:00.123456-06',solicitud_observaciones:'Traspaso del turno TUR-000085: Cajera saliente entrega a Cajera entrante. Cierre pendiente de aprobacion administrativa.\nObservaciones: Revisar documentos',handover:{sender:'Cajera saliente',receiver:'Cajera entrante',source:'TUR-000085',destination:'TUR-000086',mode:'EN_REVISION',observations:'Revisar documentos'}};
        await page.evaluate(()=>window.dispatchEvent(new Event('temo:operational-data-changed')));
        await page.getByRole('button',{name:'Revisar cierre',exact:true}).click();
        const closure=page.locator('.shift-close-modal');await closure.waitFor();
        assert.equal(await closure.locator('[data-shift-close-observations]').inputValue(),'Revisar documentos');
        assert.ok((await closure.locator('.handover-identity').textContent()).includes('Cajera entrante'));
        const purchase=closure.locator('.shift-purchase-difference');
        assert.ok((await purchase.textContent()).includes('141.08'));
        assert.ok((await purchase.textContent()).includes('Diferencia por compra de dólares'));
        await page.screenshot({path:path.join(root,'tmp','closure-purchase-difference.png'),fullPage:true,animations:'disabled'});
        await closure.locator('[data-shift-close-observations]').scrollIntoViewIfNeeded();
        const pinned=await closure.evaluate(e=>{
          const panel=e.getBoundingClientRect(),header=e.querySelector('.modal-header').getBoundingClientRect(),footer=e.querySelector('.modal-footer').getBoundingClientRect();
          return header.top>=panel.top-1&&footer.bottom<=panel.bottom+1&&footer.top>header.bottom;
        });
        assert.equal(pinned,true,'Closure header and footer remain visible after scrolling to observations');
        await page.screenshot({path:path.join(root,'tmp','closure-handover-summary.png'),fullPage:true,animations:'disabled'});
        await closure.locator('[data-shift-close-observations]').fill('Cuadre comprobado por Administradora');
        await closure.getByRole('button',{name:'Guardar',exact:true}).click();
        await closure.waitFor({state:'hidden'});
        const saved=writes.findLast(w=>w.path.endsWith('/close'));
        assert.equal(saved.body.expectedCloseRequest,shift.closure_version);
        assert.equal(saved.body.observations,'Cuadre comprobado por Administradora');
      }
      assert.deepEqual(errors,[]);await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
