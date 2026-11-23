const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');const {Client}=require('pg');
const {AuthService}=require('../dist/modules/auth/auth.service');
const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:10000};
const config={get:(key,fallback)=>key==='AUTH_SECRET'?'isolated-login-lockout-time-secret-2026':fallback};
test('preview: login lockout decisions are made after acquiring the user lock',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 for(const scenario of ['fifth failure','expired correct password','expired wrong password','still blocked'])await t.test(scenario,async()=>{
  const a=new Client(options),b=new Client(options);await a.connect();await b.connect();let user,pending;
  try{
   const username='LOGIN_TIME_'+randomUUID().replaceAll('-','');
   user=(await a.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,debe_cambiar_contrasena,intentos_fallidos)
    select id_rol,'Login time','Fixture',$1,crypt('InitialPassword123!',gen_salt('bf',4)),false,4 from temo.roles where codigo='CAJERO'
    returning id_usuario as id,usuario as username`,[username])).rows[0];
   if(scenario.startsWith('expired'))await a.query("update temo.usuarios set intentos_fallidos=5,bloqueado_hasta=clock_timestamp()+interval '500 milliseconds' where id_usuario=$1",[user.id]);
   if(scenario==='still blocked')await a.query("update temo.usuarios set intentos_fallidos=5,bloqueado_hasta=clock_timestamp()+interval '15 minutes' where id_usuario=$1",[user.id]);
   const state=async()=>(await a.query('select intentos_fallidos,bloqueado_hasta from temo.usuarios where id_usuario=$1',[user.id])).rows[0];
   const before=await state();let hashes=0;
   const db={query:(sql,args)=>b.query(sql,args),transaction:async work=>{
    await b.query('begin');try{const value=await work({query:(sql,args)=>{if(sql.includes('crypt('))hashes++;return b.query(sql,args);}});await b.query('commit');return value;}catch(e){await b.query('rollback');throw e;}
   }};
   const auth=new AuthService(db,config);
   await a.query('begin');await a.query('select 1 from temo.usuarios where id_usuario=$1 for update',[user.id]);
   pending=auth.login(user.username,scenario.includes('wrong')||scenario==='fifth failure'?'WrongPassword123!':'InitialPassword123!','','Fixture').then(value=>({value}),error=>({error}));
   let waiting=false;for(let i=0;i<150;i++){
    if((await a.query('select $1::int=any(pg_blocking_pids($2)) as waiting',[a.processID,b.processID])).rows[0].waiting){waiting=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.ok(waiting);await new Promise(resolve=>setTimeout(resolve,650));
   const released=(await a.query('select clock_timestamp() as time')).rows[0].time;
   await a.query('commit');const result=await pending;pending=undefined;const after=await state();
   if(scenario==='expired correct password'){
    assert.ok(result.value?.token,'expired lockout must allow a correct password');assert.equal(after.intentos_fallidos,0);assert.equal(after.bloqueado_hasta,null);assert.equal(hashes,1);
    await auth.validateAccessToken(result.value.token);
   }else{
    assert.equal(result.error?.getStatus(),scenario==='still blocked'?429:401);
    if(scenario==='fifth failure'){assert.equal(after.intentos_fallidos,5);assert.ok(after.bloqueado_hasta.getTime()>=released.getTime()+900000,'penalty must last fifteen minutes after the decision');assert.equal(hashes,1);}
    else if(scenario==='expired wrong password'){assert.equal(after.intentos_fallidos,1);assert.equal(after.bloqueado_hasta,null);assert.equal(hashes,1);}
    else{assert.deepEqual(after,before);assert.equal(hashes,0);}
    assert.equal((await a.query("select count(*)::int n from temo.bitacora where id_usuario=$1 and accion='INICIAR_SESION'",[user.id])).rows[0].n,0);
   }
   assert.equal((await a.query('select count(*)::int n from temo.intentos_inicio_sesion where usuario_normalizado=$1',[user.username.toLowerCase()])).rows[0].n,1);
  }finally{
   await a.query('rollback');if(pending)await pending;await b.query('rollback');
   if(user){await a.query('delete from temo.bitacora where id_usuario=$1',[user.id]);await a.query('delete from temo.intentos_inicio_sesion where usuario_normalizado=$1',[user.username.toLowerCase()]);await a.query('delete from temo.usuarios where id_usuario=$1',[user.id]);}
   await a.end();await b.end();
  }
 });
});
