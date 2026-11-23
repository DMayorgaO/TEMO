const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,createHmac}=require('node:crypto');
const {Client}=require('pg');
const {AuthService}=require('../dist/modules/auth/auth.service');
const {CatalogsService}=require('../dist/modules/catalogs/catalogs.service');
const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:15000};
const secret='isolated-recovery-lifecycle-secret-2026';
const config={get:(key,fallback)=>key==='AUTH_SECRET'?secret:fallback};
const fixture=async c=>{
 const username='RECOVERY_LIFE_'+randomUUID().replaceAll('-','').toUpperCase();
 return (await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,correo,contrasena_hash,debe_cambiar_contrasena)
 select id_rol,'Recovery','Lifecycle',$1,$2,crypt('InitialPassword123!',gen_salt('bf',4)),false from temo.roles where codigo='JEFA'
 returning id_usuario as id,usuario as username,correo as email,version_sesion as "sessionVersion",'JEFA' as "roleCode"`,[username,username+'@example.invalid'])).rows[0];
};

test('preview: recovery codes follow identity lifecycle without blocking legitimate recovery',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 const c=new Client(options);await c.connect();await c.query('begin');let serial=0,failAudit=false;
 try{
  if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
  const db={query:(sql,args)=>c.query(sql,args),transaction:async work=>{
   const sp='lifecycle_'+(++serial);await c.query('savepoint '+sp);
   try{const result=await work({query:(sql,args)=>{if(failAudit&&sql.includes('insert into temo.bitacora'))throw Error('synthetic audit failure');return c.query(sql,args);}});await c.query('release savepoint '+sp);return result;}
   catch(e){await c.query('rollback to savepoint '+sp);await c.query('release savepoint '+sp);throw e;}
  }};
  const user=await fixture(c),admin=await fixture(c),auth=new AuthService(db,config),catalogs=new CatalogsService(db),sent=[];
  auth.sendRecoveryEmail=async(to,name,code)=>sent.push({to,code});
  const edit=patch=>catalogs.save('users',user.id,{firstName:'Recovery',lastName:'Lifecycle',username:user.username,email:user.email,role:'JEFA',status:'ACTIVO',...patch},admin);
  const state=async()=>(await c.query('select contrasena_hash,version_sesion,correo from temo.usuarios where id_usuario=$1',[user.id])).rows[0];
  const recover=code=>auth.confirmPasswordRecovery(user.username,code,'RecoveredPassword123!','','Fixture');
  const scenarios=[
   ['session revocation',()=>catalogs.revokeUserSessions(user.id,admin)],
   ['logout',()=>auth.logout(user,'','Fixture')],
   ['password change',()=>auth.changePassword(user,'InitialPassword123!','ChangedPassword123!','','Fixture')],
   ['email change',()=>edit({email:'changed_'+user.email})],
   ['email changed and restored',async()=>{await edit({email:'changed_'+user.email});await edit({});}],
   ['deactivated and reactivated',async()=>{await edit({status:'INACTIVO'});await edit({});}],
   ['role changed and restored',async()=>{await edit({role:'CAJERO'});await edit({});}],
   ['username changed and restored',async()=>{await edit({username:'NEW_'+user.username});await edit({});}],
  ];
  for(const [name,change] of scenarios)await t.test(name,async()=>{
   await c.query('savepoint scenario');try{
    await auth.requestPasswordRecovery(user.username,'','Fixture');const old=sent.at(-1).code;
    await auth.session(user);
    await change();const before=await state();
    await assert.rejects(auth.session(user),e=>e.getStatus()===401);
    await assert.rejects(recover(old),e=>e.getStatus()===400);assert.deepEqual(await state(),before);
    assert.equal((await c.query("select count(*)::int n from temo.bitacora where id_usuario=$1 and datos_nuevos->>'evento'='RECUPERAR_CONTRASENA'",[user.id])).rows[0].n,0);
    await c.query("update temo.recuperaciones_contrasena set fecha_creacion=now()-interval '2 minutes' where id_usuario=$1",[user.id]);
    await auth.requestPasswordRecovery(user.username,'','Fixture');assert.equal(sent.at(-1).to,before.correo);
    await recover(sent.at(-1).code);assert.equal((await state()).version_sesion,before.version_sesion+1);
    await assert.rejects(recover(sent.at(-1).code),e=>e.getStatus()===400);
   }finally{await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');}
  });
  await t.test('profile text changes preserve code and session',async()=>{
   await c.query('savepoint scenario');try{
    await auth.requestPasswordRecovery(user.username,'','Fixture');await edit({firstName:'Updated'});
    assert.equal((await state()).version_sesion,user.sessionVersion);await recover(sent.at(-1).code);
   }finally{await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');}
  });
  await t.test('failed email audit rolls back contact and version and preserves usable code',async()=>{
   await c.query('savepoint scenario');try{
    await auth.requestPasswordRecovery(user.username,'','Fixture');const before=await state();failAudit=true;
    await assert.rejects(edit({email:'changed_'+user.email}),/synthetic audit failure/);failAudit=false;
    assert.deepEqual(await state(),before);await recover(sent.at(-1).code);
   }finally{failAudit=false;await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');}
  });
  await t.test('delivery address is bound independently of the access version',async()=>{
   await c.query('savepoint scenario');try{
    await auth.requestPasswordRecovery(user.username,'','Fixture');const old=sent.at(-1).code;
    await c.query('update temo.usuarios set correo=$2 where id_usuario=$1',[user.id,'direct_'+user.email]);
    const before=await state();assert.equal(before.version_sesion,user.sessionVersion);
    await assert.rejects(recover(old),e=>e.getStatus()===400);assert.deepEqual(await state(),before);
   }finally{await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');}
  });
  await t.test('a recovery digest copied to another account cannot be redeemed there',async()=>{
   await c.query('savepoint scenario');try{
    await auth.requestPasswordRecovery(user.username,'','Fixture');const code=sent.at(-1).code;
    await c.query(`insert into temo.recuperaciones_contrasena(id_usuario,codigo_hash,vence_en)
     select $2,codigo_hash,vence_en from temo.recuperaciones_contrasena where id_usuario=$1 and consumido_en is null`,[user.id,admin.id]);
    await assert.rejects(auth.confirmPasswordRecovery(admin.username,code,'RecoveredPassword123!','','Fixture'),e=>e.getStatus()===400);
    await recover(code);
   }finally{await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');}
  });
  await t.test('legacy unbound code cannot reset password',async()=>{
   await c.query('savepoint scenario');try{
    await c.query(`insert into temo.recuperaciones_contrasena(id_usuario,codigo_hash,vence_en) values($1,$2,now()+interval '10 minutes')`,[user.id,createHmac('sha256',secret).update(`${user.id}:001234`).digest('hex')]);
    const before=await state();await assert.rejects(recover('001234'),e=>e.getStatus()===400);assert.deepEqual(await state(),before);
   }finally{await c.query('rollback to savepoint scenario');await c.query('release savepoint scenario');}
  });
 }finally{await c.query('rollback');await c.end();}
});
const transaction=c=>async work=>{await c.query('begin');try{const value=await work(c);await c.query('commit');return value;}catch(e){await c.query('rollback');throw e;}};

test('preview: recovery confirmation waits for identity edits and rejects the old code after commit',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 for(const action of ['revoke','email'])await t.test(action,async()=>{
  const a=new Client(options),b=new Client(options);await a.connect();await b.connect();let user,admin,pending;
  try{
   user=await fixture(a);admin=await fixture(a);const sent=[];
   const auth=new AuthService({query:(sql,args)=>a.query(sql,args),transaction:transaction(a)},config);
   auth.sendRecoveryEmail=async(to,name,code)=>sent.push(code);
   await auth.requestPasswordRecovery(user.username,'','Fixture');
   await a.query('begin');
   const catalogs=new CatalogsService({transaction:work=>work(a)});
   if(action==='revoke')await catalogs.revokeUserSessions(user.id,admin);
   else await catalogs.save('users',user.id,{firstName:'Recovery',lastName:'Lifecycle',username:user.username,email:'new_'+user.email,role:'JEFA',status:'ACTIVO'},admin);
   const confirming=new AuthService({transaction:transaction(b)},config);
   pending=assert.rejects(confirming.confirmPasswordRecovery(user.username,sent[0],'RecoveredPassword123!','','Fixture'),e=>e.getStatus()===400);
   let blocked=false;
   for(let i=0;i<150;i++){
    const result=await a.query('select $1::int=any(pg_blocking_pids($2)) as blocked',[a.processID,b.processID]);
    if(result.rows[0].blocked){blocked=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.ok(blocked,'confirmation must wait for the identity administration transaction');
   await a.query('commit');await pending;pending=undefined;
   const current=(await a.query("select version_sesion,contrasena_hash=crypt('InitialPassword123!',contrasena_hash) as unchanged from temo.usuarios where id_usuario=$1",[user.id])).rows[0];
   assert.equal(current.version_sesion,user.sessionVersion+1);assert.ok(current.unchanged);
   assert.equal((await a.query("select count(*)::int n from temo.bitacora where id_usuario=$1 and datos_nuevos->>'evento'='RECUPERAR_CONTRASENA'",[user.id])).rows[0].n,0);
  }finally{
   await a.query('rollback');if(pending)await pending.catch(()=>{});await b.query('rollback');
   for(const actor of [user,admin].filter(Boolean)){
    await a.query('delete from temo.bitacora where id_usuario=$1 or id_registro=$1',[actor.id]);
    await a.query('delete from temo.recuperaciones_contrasena where id_usuario=$1',[actor.id]);
    await a.query('delete from temo.usuarios where id_usuario=$1',[actor.id]);
   }
   await a.end();await b.end();
  }
 });
});
