// Two synthetic browser sessions; every API request is intercepted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const id='11111111-1111-4111-8111-111111111111';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  try{
    let current={database_id:id,id:'DIR-00001',edit_version:'a'.repeat(64),name:'PERSONA QA',status:'ACTIVO',observations:'',identifiers:[{institution:'BAC',type:'Cuenta',number:'1234',currency:'NIO'}],identities:[],references:[],sources:[]};
    const edits=[],errors=[];
    async function session(){
      const context=await browser.newContext({viewport:{width:1366,height:768}});
      const user={id,fullName:'ADMIN QA',roleCode:'JEFA',roleName:'Administrador',permissions:['VER_DIRECTORY']};
      await context.addInitScript(user=>{sessionStorage.setItem('temo:auth-token','synthetic-directory');sessionStorage.setItem('temo:auth-user',JSON.stringify(user));},user);
      await context.route('**/api/**',async route=>{
        const request=route.request(),p=new URL(request.url()).pathname.replace(/^.*\/api/,'');
        let body=[],status=200;
        if(p==='/auth/me')body={user};
        else if(p==='/shifts/access')body={active:null,prepared:null};
        else if(p==='/directory')body=[current];
        else if(p===`/directory/${id}`){
          if(request.method()==='PUT'){
            const input=request.postDataJSON();edits.push(input);
            if(input.expectedVersion!==current.edit_version){status=409;body={statusCode:409,code:'DIR-DAT-409',message:'El destinatario cambio desde que lo abrio. Sus cambios no se guardaron.'};}
            else {current={...current,...input,edit_version:'b'.repeat(64)};body=current;}
          }else body=current;
        }
        await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:3188/#/directorio');
      await page.getByTitle('Editar',{exact:true}).click();
      await page.getByRole('dialog').waitFor();
      return page;
    }
    const first=await session(),second=await session();
    await first.getByLabel('Nombre',{exact:true}).fill('CAMBIO GANADOR');
    await first.getByRole('button',{name:'Guardar',exact:true}).click();
    await first.getByRole('dialog').waitFor({state:'hidden'});
    await second.getByLabel('Nombre',{exact:true}).fill('BORRADOR ANTIGUO');
    await second.getByRole('button',{name:'Guardar',exact:true}).click();
    await second.getByText('El destinatario cambio desde que lo abrio.',{exact:false}).waitFor();
    assert.equal(current.name,'CAMBIO GANADOR');
    assert.equal(await second.getByLabel('Nombre',{exact:true}).inputValue(),'BORRADOR ANTIGUO','Conflict retains the user draft');
    assert.equal(edits.length,2);
    assert.ok(edits.every(input=>input.expectedVersion==='a'.repeat(64)),'The original read version is sent, not replaced by polling');
    assert.deepEqual(errors,[]);
    console.log('Directory: two sessions, original version, stale-write rejection and retained draft passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
