const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {AuthService}=require('../dist/modules/auth/auth.service');
const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public'};
const config={get:(name,fallback)=>name==='AUTH_SECRET'?'isolated-password-recovery-fixture-secret-2026':fallback};
const fixture=async c=>{const username='recovery_boundary_'+randomUUID().replaceAll('-','');return (await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,correo,contrasena_hash,debe_cambiar_contrasena)
 select id_rol,'Recovery','Fixture',$1,$2,crypt('InitialPassword123!',gen_salt('bf',4)),false from temo.roles where codigo='JEFA'
 returning id_usuario as id,usuario as username,version_sesion as version`,[username,username+'@example.invalid'])).rows[0];};

test('preview: recovery request revalidates identity snapshot and confirmation audit rolls back',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 const c=new Client(options);await c.connect();
 try{
  await c.query('begin');
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const user=await fixture(c);let changeBeforeWrite=null,failAudit=false;const sent=[];
  const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
   if(changeBeforeWrite){await c.query(changeBeforeWrite,[user.id]);changeBeforeWrite=null;}
   await c.query('savepoint write');try{
    const result=await work({query:(sql,args)=>{if(failAudit&&sql.includes('insert into temo.bitacora'))throw Error('synthetic audit failure');return c.query(sql,args);}});
    await c.query('release savepoint write');return result;
   }catch(e){await c.query('rollback to savepoint write');await c.query('release savepoint write');throw e;}
  }};
  const auth=new AuthService(db,config);auth.sendRecoveryEmail=async(...args)=>sent.push(args);
  for(const [name,sql] of [
   ['revoked','update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1'],
   ['inactive',"update temo.usuarios set estado='INACTIVO' where id_usuario=$1"],
   ['changed role',"update temo.usuarios set id_rol=(select id_rol from temo.roles where codigo='CAJERO') where id_usuario=$1"],
   ['changed email',"update temo.usuarios set correo='changed@example.invalid' where id_usuario=$1"],
   ['inactive role',"update temo.roles set estado='INACTIVO' where id_rol=(select id_rol from temo.usuarios where id_usuario=$1)"]
  ])await t.test(name,async()=>{
   await c.query('savepoint scenario');changeBeforeWrite=sql;
   const response=await auth.requestPasswordRecovery(user.username,'','Fixture');assert.equal(response.success,true);assert.equal(sent.length,0);
   assert.equal((await c.query('select count(*)::int n from temo.recuperaciones_contrasena where id_usuario=$1',[user.id])).rows[0].n,0);
   assert.equal((await c.query('select count(*)::int n from temo.bitacora where id_usuario=$1',[user.id])).rows[0].n,0);
   await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');
  });
  await auth.requestPasswordRecovery(user.username,'','Fixture');assert.equal(sent.length,1);
  const state=async()=>({user:(await c.query('select contrasena_hash,version_sesion from temo.usuarios where id_usuario=$1',[user.id])).rows[0],codes:(await c.query('select consumido_en,intentos from temo.recuperaciones_contrasena where id_usuario=$1',[user.id])).rows,audit:(await c.query('select count(*)::int n from temo.bitacora where id_usuario=$1',[user.id])).rows[0].n});
  await t.test('confirmation audit failure preserves password, version and usable code',async()=>{
   const before=await state();failAudit=true;
   await assert.rejects(auth.confirmPasswordRecovery(user.username,sent[0][2],'RecoveredPassword123!','','Fixture'),/synthetic audit failure/);failAudit=false;
   assert.ok(JSON.stringify(await state())===JSON.stringify(before),'identity, code and audit remain unchanged');
   await auth.confirmPasswordRecovery(user.username,sent[0][2],'RecoveredPassword123!','','Fixture');
   assert.equal((await state()).user.version_sesion,user.version+1);
   await assert.rejects(auth.confirmPasswordRecovery(user.username,sent[0][2],'OtherPassword123!','','Fixture'),e=>e.getStatus()===400);
  });
 }finally{await c.query('rollback');await c.end();}
});

test('preview: confirmation waits for concurrent deactivation and rejects without consuming code',{skip:!process.env.TEMO_TEST_PREVIEW},async()=>{
 const a=new Client(options),b=new Client(options);await a.connect();await b.connect();let user,pending;
 try{
  user=await fixture(a);const auth=new AuthService({transaction:work=>work(b)},config);
  await a.query(`insert into temo.recuperaciones_contrasena(id_usuario,codigo_hash,vence_en) values($1,$2,now()+interval '10 minutes')`,[user.id,auth.hashRecoveryCode(user.id,'001234',user.version,user.username+'@example.invalid')]);
  await a.query('begin');await a.query("update temo.usuarios set estado='INACTIVO' where id_usuario=$1",[user.id]);
  await b.query('begin');await b.query("set local statement_timeout='5s'");
  pending=assert.rejects(auth.confirmPasswordRecovery(user.username,'001234','RecoveredPassword123!','','Fixture'),e=>e.getStatus()===400);let waiting=false;
  for(let i=0;i<100;i++){
   if((await a.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID])).rows[0]?.wait_event_type==='Lock'){waiting=true;break;}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(waiting,true);await a.query('commit');await pending;pending=undefined;await b.query('rollback');
  assert.equal((await a.query('select version_sesion from temo.usuarios where id_usuario=$1',[user.id])).rows[0].version_sesion,user.version);
  assert.equal((await a.query('select consumido_en from temo.recuperaciones_contrasena where id_usuario=$1',[user.id])).rows[0].consumido_en,null);
  assert.equal((await a.query('select count(*)::int n from temo.bitacora where id_usuario=$1',[user.id])).rows[0].n,0);
 }finally{
  await a.query('rollback');if(pending)await pending;await b.query('rollback');
  if(user){await a.query('delete from temo.recuperaciones_contrasena where id_usuario=$1',[user.id]);await a.query('delete from temo.usuarios where id_usuario=$1',[user.id]);}
  await a.end();await b.end();
 }
});
