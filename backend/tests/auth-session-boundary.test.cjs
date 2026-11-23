require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict');
const {Module,RequestMethod,UnauthorizedException}=require('@nestjs/common');
const {PATH_METADATA,METHOD_METADATA}=require('@nestjs/common/constants');
const {NestFactory,Reflector}=require('@nestjs/core');
const {AuthGuard}=require('../dist/modules/auth/auth.guard');
const {AuthController}=require('../dist/modules/auth/auth.controller');
const {AuthService}=require('../dist/modules/auth/auth.service');
const {AuthRouteGuard}=require('../dist/modules/auth/auth-route.guard');
const publicNames=['login','requestPasswordRecovery','confirmPasswordRecovery','verifyMfa'];
const bodies={login:{username:'fixture',password:'Password123!'},requestPasswordRecovery:{identifier:'fixture'},confirmPasswordRecovery:{identifier:'fixture',code:'001234',newPassword:'Password123!'},verifyMfa:{challenge:'a'.repeat(43),code:'001234'},changePassword:{currentPassword:'Password123!',newPassword:'NewPassword123!'},changeProfilePhoto:{photoDataUrl:'data:image/png;base64,AAAA'}};
test('auth HTTP preserves public entry points and basic session access while rejecting ambiguous inputs',async()=>{
 let calls=0;
 const names=Object.getOwnPropertyNames(AuthController.prototype).filter(n=>Reflect.hasMetadata(METHOD_METADATA,AuthController.prototype[n]));
 assert.equal(names.length,8);
 const service=Object.fromEntries(names.map(n=>[n,()=>{calls++;return {success:true};}]));
 class Fixture{} Module({controllers:[AuthController],providers:[{provide:AuthService,useValue:service}]})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix('api');
 app.useGlobalGuards(new AuthGuard(new Reflector(),{validateAccessToken:async token=>{
  if(token==='REVOKED')throw new UnauthorizedException();
  return {id:'fixture',roleCode:token.split('-')[0],sessionVersion:token.endsWith('-missing')?undefined:1,mustChangePassword:token.endsWith('-password')};
 }}));
 try {await app.listen(0,'127.0.0.1');const base=await app.getUrl();let checks=0;
 for(const name of names){
  const fn=AuthController.prototype[name],method=RequestMethod[Reflect.getMetadata(METHOD_METADATA,fn)],path='/api/auth/'+Reflect.getMetadata(PATH_METADATA,fn);
  const send=(token,suffix='',body=bodies[name]??{})=>fetch(base+path+suffix,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  for(const token of [null,'REVOKED','JEFA','CAJERO','TRANSFERISTA','UNKNOWN','CAJERO-password','CAJERO-missing']){
   const before=calls,isPublic=publicNames.includes(name),basic=['session','changePassword','logout'].includes(name);
   const status=isPublic?201:!token||token==='REVOKED'?401:token.endsWith('-missing')||(!basic&&(token==='UNKNOWN'||token.endsWith('-password')))?403:method==='POST'?201:200;
   const response=await send(token);assert.equal(response.status,status,`${name}/${token}: ${await response.text()}`);
   assert.equal(calls-before,status<300?1:0);checks++;
  }
  const before=calls;assert.equal((await send('CAJERO','?userId=another')).status,400);assert.equal(calls,before);checks++;
  if(name==='logout')for(const body of [{userId:'another'},[],{version:5}]){const prior=calls;assert.equal((await send('CAJERO','',body)).status,400);assert.equal(calls,prior);checks++;}
 }
 console.log(`Auth HTTP: ${checks} cases across 8 handlers.`);
 }finally{await app.close();}
});
test('unreviewed auth handlers fail closed',()=>{
 assert.throws(()=>new AuthRouteGuard().canActivate({getHandler:()=>function future(){},switchToHttp:()=>({getRequest:()=>({})})}),e=>e.getStatus()===403);
});

test('preview: session mutations enforce current identity and roll back on audit failure', {skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
 const {Client}=require('pg'),{randomUUID}=require('node:crypto');
 const client=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public'});
 await client.connect();
 try{
  await client.query('begin');
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(client);
  const username='session_'+randomUUID().replaceAll('-','');
  const row=(await client.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
   select id_rol,'Session','Fixture',$1,crypt('Password123!',gen_salt('bf',4)),false from temo.roles where codigo='CAJERO' returning id_usuario as id,version_sesion`,[username])).rows[0];
  const user={id:row.id,username,roleCode:'CAJERO',sessionVersion:row.version_sesion,mustChangePassword:false};
  let failAudit=false;
  const db={query:(sql,args)=>client.query(sql,args),transaction:async work=>{
   await client.query('savepoint mutation');
   try{const result=await work({query:(sql,args)=>{if(failAudit&&sql.includes('insert into temo.bitacora'))throw Error('synthetic audit failure');return client.query(sql,args);}});await client.query('release savepoint mutation');return result;}
   catch(e){await client.query('rollback to savepoint mutation');await client.query('release savepoint mutation');throw e;}
  }};
  const auth=new AuthService(db,{get:(key,fallback)=>key==='AUTH_SECRET'?'isolated-auth-session-fixture-secret-2026':fallback});
  const state=async()=>({user:(await client.query('select foto_perfil,version_sesion from temo.usuarios where id_usuario=$1',[user.id])).rows[0],audits:(await client.query('select count(*)::int n from temo.bitacora where id_usuario=$1',[user.id])).rows[0].n});
  const photo='data:image/png;base64,AAAA';
  await auth.changeProfilePhoto(user,photo,'','Fixture');assert.equal((await state()).user.foto_perfil,photo);
  for(const operation of [()=>auth.changeProfilePhoto(user,'data:image/png;base64,BBBB','','Fixture'),()=>auth.logout(user,'','Fixture')]){
   const before=await state();failAudit=true;await assert.rejects(operation,/synthetic audit failure/);failAudit=false;assert.deepEqual(await state(),before);
  }
  for(const sql of ["version_sesion=version_sesion+1","estado='INACTIVO'","debe_cambiar_contrasena=true","id_rol=(select id_rol from temo.roles where codigo='TRANSFERISTA')"]){
   await client.query('savepoint identity');await client.query('update temo.usuarios set '+sql+' where id_usuario=$1',[user.id]);
   const before=await state();await assert.rejects(auth.changeProfilePhoto(user,photo,'','Fixture'),e=>e.getStatus()===401);assert.deepEqual(await state(),before);
   if(!sql.includes('debe_cambiar')){await assert.rejects(auth.logout(user,'','Fixture'),e=>e.getStatus()===401);await assert.rejects(auth.session(user),e=>e.getStatus()===401);assert.deepEqual(await state(),before);}
   await client.query('rollback to savepoint identity');await client.query('release savepoint identity');
  }
  await client.query('update temo.usuarios set debe_cambiar_contrasena=true where id_usuario=$1',[user.id]);
  await auth.logout({...user,mustChangePassword:true},'','Fixture');
  assert.equal((await state()).user.version_sesion,user.sessionVersion+1);
  const newer=await state();await assert.rejects(auth.logout(user,'','Fixture'),e=>e.getStatus()===401);assert.deepEqual(await state(),newer);
 }finally{await client.query('rollback');await client.end();}
});


test('preview: concurrent revocation wins before photo or logout can mutate', {skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
 const {Client}=require('pg'),{randomUUID}=require('node:crypto');
 const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview'};
 const first=new Client(options),second=new Client(options);await first.connect();await second.connect();
 let actor,pending;
 try{
  actor=(await first.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena)
   select id_rol,'Auth concurrency','Fixture',$1,'not-a-login-credential',false from temo.roles where codigo='CAJERO'
   returning id_usuario as id,version_sesion as "sessionVersion",usuario as username`,['auth_race_'+randomUUID().replaceAll('-','')])).rows[0];
  actor.roleCode='CAJERO';
  const auth=new AuthService({transaction:work=>work(second)},{get:(key,fallback)=>key==='AUTH_SECRET'?'isolated-auth-session-fixture-secret-2026':fallback});
  for(const operation of [()=>auth.changeProfilePhoto(actor,'data:image/png;base64,AAAA','','Fixture'),()=>auth.logout(actor,'','Fixture')]){
   actor.sessionVersion=(await first.query('select version_sesion from temo.usuarios where id_usuario=$1',[actor.id])).rows[0].version_sesion;
   await first.query('begin');await first.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1',[actor.id]);
   await second.query('begin');await second.query("set local statement_timeout='5s'");
   pending=assert.rejects(operation(),e=>e.getStatus()===401);
   let waiting=false;
   for(let attempt=0;attempt<100;attempt++){
    const state=await first.query('select wait_event_type from pg_stat_activity where pid=$1',[second.processID]);
    if(state.rows[0]?.wait_event_type==='Lock'){waiting=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.equal(waiting,true);await first.query('commit');await pending;pending=undefined;await second.query('rollback');
   const row=(await first.query('select foto_perfil,version_sesion from temo.usuarios where id_usuario=$1',[actor.id])).rows[0];
   assert.equal(row.foto_perfil,null);assert.equal(row.version_sesion,actor.sessionVersion+1);
   assert.equal((await first.query('select count(*)::int n from temo.bitacora where id_usuario=$1',[actor.id])).rows[0].n,0);
  }
 }finally{
  await first.query('rollback');if(pending)await pending;await second.query('rollback');
  if(actor)await first.query('delete from temo.usuarios where id_usuario=$1',[actor.id]);
  await first.end();await second.end();
 }
});
