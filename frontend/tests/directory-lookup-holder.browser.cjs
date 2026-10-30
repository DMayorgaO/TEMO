// Synthetic directory only; all API requests are intercepted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try{
    const context=await browser.newContext({viewport:{width:1366,height:768}});
    const user={id:'11111111-1111-4111-8111-111111111111',fullName:'ADMIN QA',roleCode:'JEFA',roleName:'Administrador',permissions:['VER_TRANSACTIONS']};
    await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-directory-holder');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
    const entry={database_id:user.id,id:'DIR-00001',edit_version:'a'.repeat(64),name:'DESTINATARIO QA',status:'ACTIVO',identifiers:[],references:['Referencia QA'],identities:[
      {number:'001-010101-0001A',holder:'  MARIA DE LOS ANGELES PEREZ  '},
      {number:'002-010101-0002A',holder:''},
      {number:'003-010101-0003A',holder:'   '},
      {number:'004-010101-0004A'},
    ]};
    const errors=[];
    await context.route('**/api/**',async route=>{
      const p=new URL(route.request().url()).pathname.replace(/^.*\/api/,'');
      const body=p==='/auth/me'?{user}:p==='/shifts/access'?{active:null,prepared:null}:p==='/shifts/current'?null:p==='/directory'?[entry]:[];
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:3188/#/transacciones');
    await page.getByRole('button',{name:'Directorio',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Directorio de destinatarios'});
    await dialog.getByText('001-010101-0001A',{exact:false}).waitFor();
    assert.equal(await dialog.locator('.directory-lookup__identity-holder').count(),1);
    assert.equal(await dialog.locator('.directory-lookup__identity-holder').innerText(),'MARIA DE LOS ANGELES PEREZ');
    assert.equal(await dialog.locator('.directory-lines > span').count(),5,'All IDs and references remain');
    for(const [width,height]of [[1366,768],[390,844]]){
      await page.setViewportSize({width,height});
      await page.reload();await page.getByRole('button',{name:'Directorio',exact:true}).click();
      await dialog.locator('.directory-lookup__identity-holder').waitFor();
      assert.ok(await dialog.locator('.directory-lookup__identity-holder').evaluate(el=>{
        const holder=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();
        return holder.top>parent.top+10&&holder.right<=parent.right+1&&getComputedStyle(el).fontSize==='11px';
      }),'Holder is a compact line below its ID without overflowing');
      await dialog.screenshot({path:path.resolve(__dirname,`../../tmp/directory-holder-${width}.png`)});
    }
    assert.deepEqual(errors,[]);
    console.log('Directory lookup: compact holder below ID, no blank labels, desktop/mobile passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
