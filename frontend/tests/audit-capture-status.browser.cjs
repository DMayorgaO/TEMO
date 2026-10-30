// Synthetic status and session, no real API records or writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try{
    for(const scenario of ['healthy','partial','unavailable','malformed']){
      const context=await browser.newContext({viewport:{width:1366,height:768}});
      const user={id:'11111111-1111-4111-8111-111111111111',fullName:'ADMIN QA',roleCode:'JEFA',roleName:'Administrador',permissions:['VER_AUDIT']};
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-audit-capture');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      let captureCalls=0;const errors=[];
      await context.route('**/api/**',async route=>{
        const p=new URL(route.request().url()).pathname.replace(/^.*\/api/,'');let body=[],status=200;
        if(p==='/auth/me')body={user};
        else if(p==='/shifts/access')body={active:null,prepared:null};
        else if(p==='/catalogs/auditoria/estado-captura'){
          captureCalls++;
          if(scenario==='unavailable'){status=503;body={message:'Synthetic unavailable'};}
          else if(scenario!=='malformed')body={scope:'current-process',startedAt:'2026-10-29T12:00:00Z',hasObservedGaps:scenario==='partial',categories:{ACCESO_DENEGADO:{failed:scenario==='partial'?2:0,overloaded:0},LECTURA_SENSIBLE:{failed:0,overloaded:scenario==='partial'?3:0}}};
        }
        await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      const response=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/auditoria/estado-captura'));
      await page.goto('http://127.0.0.1:3188/#/auditoria');await response;
      if(scenario==='healthy'){
        await page.waitForTimeout(150);
        assert.equal(await page.locator('.audit-capture-warning').count(),0,'No misleading success badge or warning in a healthy process');
      }else{
        const warning=page.locator('.audit-capture-warning');await warning.waitFor();
        const text=await warning.innerText();
        assert.ok(text.includes(scenario==='partial'?'2 fallos y 3 omisiones':'No se pudo comprobar'));
        for(const [width,height]of [[1366,768],[390,844]]){
          await page.setViewportSize({width,height});
          await page.waitForFunction(()=>{
            const box=document.querySelector('.audit-capture-warning')?.getBoundingClientRect();
            return box&&box.left>=0&&box.right<=window.innerWidth;
          });
          assert.ok(await warning.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Warning fits desktop/mobile');
          if(scenario==='partial')await warning.screenshot({path:path.resolve(__dirname,`../../tmp/audit-capture-warning-${width}.png`),animations:'disabled'});
        }
      }
      assert.equal(captureCalls,1,'No polling loop is introduced on mounting');
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('Audit capture: partial/unavailable/malformed status, healthy silence and responsive warning passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
