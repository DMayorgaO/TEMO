const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {Client}=require('pg');
const {AuthService}=require('../dist/modules/auth/auth.service');
const {MfaService}=require('../dist/modules/auth/mfa.service');
const options={connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,extensions,public',statement_timeout:10000};
const settings={AUTH_SECRET:'synthetic-auth-expiration-secret-2026',MFA_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
const config={get:(name,fallback)=>settings[name]??fallback};
const hash=s=>createHash('sha256').update(s).digest('hex');
const transact=c=>async work=>{await c.query('begin');try{const value=await work(c);await c.query('commit');return value;}catch(e){await c.query('rollback');throw e;}};

test('preview: authentication deadlines use current time after real SQL lock waits',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
 for(const scenario of ['recovery expired correct code','recovery expired wrong code','MFA expired','new recovery issuance','new MFA issuance'])await t.test(scenario,async()=>{
  const a=new Client(options),b=new Client(options);await a.connect();await b.connect();let user,pending;
  try{
   const username='TIME_'+randomUUID().replaceAll('-','');
   user=(await a.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,correo,contrasena_hash,debe_cambiar_contrasena)
    select id_rol,'Auth time','Fixture',$1,$2,crypt('InitialPassword123!',gen_salt('bf',4)),false from temo.roles where codigo='JEFA'
    returning id_usuario as id,usuario as username,correo as email,version_sesion as "sessionVersion"`,[username,username+'@example.invalid'])).rows[0];
   const db={query:(sql,args)=>b.query(sql,args),transaction:transact(b)},auth=new AuthService(db,config),mfa=new MfaService(db,config),sent=[];
   auth.sendRecoveryEmail=async(to,name,code)=>sent.push(code);
   const challenge=randomBytes(32).toString('base64url');
   if(scenario.startsWith('recovery expired'))await a.query(`insert into temo.recuperaciones_contrasena(id_usuario,codigo_hash,vence_en)
    values($1,$2,clock_timestamp()+interval '500 milliseconds')`,[user.id,auth.hashRecoveryCode(user.id,'001234',user.sessionVersion,user.email)]);
   if(scenario==='MFA expired')await a.query(`insert into temo.desafios_mfa(token_hash,id_usuario,version_sesion,alta,secreto_cifrado,vence_en)
    values($1,$2,$3,true,'unused-expired-fixture',clock_timestamp()+interval '500 milliseconds')`,[hash(challenge),user.id,user.sessionVersion]);
   await a.query('begin');await a.query('select pg_advisory_xact_lock(741260810)');
   const run=()=>scenario.startsWith('recovery expired')?auth.confirmPasswordRecovery(user.username,scenario.endsWith('wrong code')?'999999':'001234','RecoveredPassword123!','','Fixture'):
    scenario==='MFA expired'?mfa.verify(challenge,'000000','','','Fixture'):
    scenario==='new recovery issuance'?auth.requestPasswordRecovery(user.username,'','Fixture'):mfa.begin(user);
   pending=run().then(value=>({value}),error=>({error}));
   let blocked=false;
   for(let i=0;i<150;i++){
    if((await a.query('select $1::int=any(pg_blocking_pids($2)) as blocked',[a.processID,b.processID])).rows[0].blocked){blocked=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.ok(blocked,'operation must be waiting for the identity lock');
   await new Promise(resolve=>setTimeout(resolve,600));
   const released=(await a.query('select clock_timestamp() as time')).rows[0].time;
   await a.query('commit');const result=await pending;pending=undefined;
   if(scenario.includes('expired')){
    assert.equal(result.error?.getStatus(),scenario==='MFA expired'?401:400,'expired credential must be rejected after the wait');
    const table=scenario==='MFA expired'?'desafios_mfa':'recuperaciones_contrasena';
    const record=(await a.query(`select intentos,consumido_en from temo.${table} where id_usuario=$1`,[user.id])).rows[0];
    assert.equal(record.intentos,0);assert.equal(record.consumido_en,null);
    const identity=(await a.query("select version_sesion,contrasena_hash=crypt('InitialPassword123!',contrasena_hash) as unchanged from temo.usuarios where id_usuario=$1",[user.id])).rows[0];
    assert.equal(identity.version_sesion,user.sessionVersion);assert.ok(identity.unchanged);
    assert.equal((await a.query('select count(*)::int n from temo.bitacora where id_usuario=$1',[user.id])).rows[0].n,0);
   }else{
    assert.ok(!result.error);const recovery=scenario==='new recovery issuance';
    const row=(await a.query(recovery?'select fecha_creacion as created,vence_en from temo.recuperaciones_contrasena where id_usuario=$1':'select creado_en as created,vence_en from temo.desafios_mfa where id_usuario=$1',[user.id])).rows[0];
    assert.ok(row.created.getTime()>=released.getTime(),'issuance timestamp must follow the lock wait');
    assert.ok(row.vence_en.getTime()>=released.getTime()+(recovery?600000:300000),'full validity begins at actual issuance');
    if(recovery){assert.equal(sent.length,1);await auth.confirmPasswordRecovery(user.username,sent[0],'RecoveredPassword123!','','Fixture');}
    else{assert.equal(result.value.enrollment,true);assert.ok(result.value.qrDataUrl);}
   }
  }finally{
   await a.query('rollback');if(pending)await pending;await b.query('rollback');
   if(user){await a.query('delete from temo.bitacora where id_usuario=$1',[user.id]);await a.query('delete from temo.recuperaciones_contrasena where id_usuario=$1',[user.id]);await a.query('delete from temo.usuarios where id_usuario=$1',[user.id]);}
   await a.end();await b.end();
  }
 });
});
