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
      let shift=makeShift();const closed=makeShift(80,'CERRADO');const writes=[];const errors=[];let failBalance=false;
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','visual-fixture-not-a-real-session');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      await context.route('**/api/**',async route=>{
        const request=route.request(),url=new URL(request.url()),p=url.pathname.replace(/^.*\/api/,'');
        let body=[];
        if(request.method()!=='GET')writes.push({path:p,body:request.postDataJSON()});
        if(p==='/auth/me')body={user};
        else if(p==='/transfers/context')body={shifts:[],accounts:[]};
        else if(p==='/shifts/notifications')body=[];
        else if(p==='/shifts/access')body={active:{database_id:id,estado:'ABIERTO',sucursal:shift.sucursal,caja:shift.caja},prepared:null};
        else if(p==='/shifts/dashboard')body={today,tableDay:url.searchParams.get('day')||today,from:today,to:today,counts:[],accounts:[],banks:[],balances:[],lafise:[],reconciliation:[]};
        else if(p==='/shifts')body=[shift,closed];
        else if(p==='/shifts/current'||p.startsWith('/shifts/'+id)){
          if(p.endsWith('/account-balances')){
            if(failBalance){failBalance=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fallo de prueba al guardar saldo'})});return;}
            const input=request.postDataJSON().balances[0];shift={...shift,balances:shift.balances.map(row=>row.account===input.account?{...row,system:String(input.amount),system_income:input.income===undefined?row.system_income:String(input.income),system_expense:input.expense===undefined?row.system_expense:String(input.expense)}:row)};
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
        await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');
      }
      assert.deepEqual(errors,[]);await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
